import "server-only";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { idempotencyKeys } from "../../db/schema";
import { now } from "@/lib/clock";
import { withUserTx } from "./db";
import { HttpError } from "./http";

// Идемпотентность POST, создающих сущности (SPEC §6.5 «Отправка», AC-5.4).
//
//   export const POST = route(async (req) => {
//     const me = await requireStudent(req);
//     return withIdempotency(req, me.userId, async () => { ...; return ok(dto, { status: 201 }); });
//   });
//
// • Заголовок Idempotency-Key обязателен: нет или неверный формат → 422 VALIDATION.
// • Повтор с тем же ключом и тем же телом → сохранённый ответ (тот же статус и JSON), fn не вызывается.
// • Тот же ключ с другим телом → 422 { reason: "IDEMPOTENCY_KEY_REUSED" }.
// • Первый запрос ещё выполняется → 409 CONFLICT { reason: "IN_PROGRESS" }.
// • Ответ 5xx или исключение не сохраняются: клиент может повторить с тем же ключом.
// Ключи живут до ежедневного сброса демо-данных.

const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;

export async function withIdempotency(
  req: Request,
  userId: string,
  fn: () => Promise<Response>,
): Promise<Response> {
  const key = req.headers.get("idempotency-key");
  if (!key || !KEY_RE.test(key))
    throw new HttpError(422, "VALIDATION", { reason: "IDEMPOTENCY_KEY_REQUIRED" });

  const body = await req.clone().text();
  const requestHash = createHash("sha256")
    .update(`${req.method} ${new URL(req.url).pathname}\n${body}`)
    .digest("hex");
  const where = and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key));

  // Захват ключа: вставка проходит только у первого запроса (первичный ключ user_id + key).
  const claimed = await withUserTx(userId, (tx) =>
    tx
      .insert(idempotencyKeys)
      .values({ userId, key, requestHash, createdAt: now() })
      .onConflictDoNothing()
      .returning({ key: idempotencyKeys.key }),
  );

  if (claimed.length === 0) {
    const [prev] = await withUserTx(userId, (tx) =>
      tx.select().from(idempotencyKeys).where(where).limit(1),
    );
    if (!prev) throw new HttpError(409, "CONFLICT", { reason: "IN_PROGRESS" });
    if (prev.requestHash !== requestHash)
      throw new HttpError(422, "VALIDATION", { reason: "IDEMPOTENCY_KEY_REUSED" });
    if (prev.statusCode === null) throw new HttpError(409, "CONFLICT", { reason: "IN_PROGRESS" });
    return NextResponse.json(prev.response, {
      status: prev.statusCode,
      headers: { "Cache-Control": "no-store", "Idempotent-Replayed": "true" },
    });
  }

  const release = () => withUserTx(userId, (tx) => tx.delete(idempotencyKeys).where(where));
  let res: Response;
  try {
    res = await fn();
  } catch (err) {
    await release();
    throw err;
  }
  if (res.status >= 500) {
    await release();
    return res;
  }
  const text = await res.clone().text();
  const response = text ? (JSON.parse(text) as unknown) : null;
  await withUserTx(userId, (tx) =>
    tx
      .update(idempotencyKeys)
      .set({ statusCode: res.status, response: sql`${JSON.stringify(response)}::jsonb` })
      .where(where),
  );
  return res;
}
