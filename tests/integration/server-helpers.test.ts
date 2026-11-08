import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { auditLog } from "@db/schema";
import { audit } from "@/server/audit";
import { getDb, withUserTx } from "@/server/db";
import { HttpError, ok } from "@/server/http";
import { withIdempotency } from "@/server/idempotency";
import { resetDb } from "../helpers/api";
import type { Fixtures } from "../helpers/fixtures";

// withIdempotency (AC-5.4) и audit() — на реальной БД с RLS.

let fx: Fixtures;
beforeAll(async () => {
  fx = await resetDb();
});

const post = (key: string | null, body: unknown) =>
  new NextRequest("http://localhost:3000/api/me/things", {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) },
    body: JSON.stringify(body),
  });

describe("withIdempotency", () => {
  it("повтор с тем же ключом возвращает сохранённый ответ и не выполняет действие второй раз", async () => {
    let calls = 0;
    const create = async () => ok({ id: `thing-${++calls}` }, { status: 201 });
    const first = await withIdempotency(post("key-aaaaaaaa", { a: 1 }), fx.users.anna, create);
    const second = await withIdempotency(post("key-aaaaaaaa", { a: 1 }), fx.users.anna, create);
    expect(calls).toBe(1);
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual(await first.json());
    expect(second.headers.get("idempotent-replayed")).toBe("true");
  });

  it("ключи разных пользователей не пересекаются", async () => {
    let calls = 0;
    const create = async () => ok({ n: ++calls }, { status: 201 });
    await withIdempotency(post("key-shared-1", {}), fx.users.anna, create);
    await withIdempotency(post("key-shared-1", {}), fx.users.maxim, create);
    expect(calls).toBe(2);
  });

  it("тот же ключ с другим телом → 422, без ключа → 422", async () => {
    const create = async () => ok({}, { status: 201 });
    await withIdempotency(post("key-bbbbbbbb", { a: 1 }), fx.users.anna, create);
    await expect(
      withIdempotency(post("key-bbbbbbbb", { a: 2 }), fx.users.anna, create),
    ).rejects.toMatchObject({
      status: 422,
      details: { reason: "IDEMPOTENCY_KEY_REUSED" },
    });
    await expect(withIdempotency(post(null, {}), fx.users.anna, create)).rejects.toBeInstanceOf(
      HttpError,
    );
  });

  it("ошибка 5xx не запоминается: повтор выполняет действие заново", async () => {
    let calls = 0;
    const flaky = async () =>
      ++calls === 1 ? ok({ error: 1 }, { status: 503 }) : ok({ ok: true }, { status: 201 });
    expect((await withIdempotency(post("key-cccccccc", {}), fx.users.anna, flaky)).status).toBe(
      503,
    );
    expect((await withIdempotency(post("key-cccccccc", {}), fx.users.anna, flaky)).status).toBe(
      201,
    );
    expect(calls).toBe(2);
  });
});

describe("audit", () => {
  it("автор записи — пользователь транзакции, а не аргумент", async () => {
    const entityId = fx.requests.anna[0];
    await withUserTx(fx.users.elena, (tx) =>
      audit(tx, "request.view", "request", entityId, { source: "test" }),
    );
    const rows = await getDb().select().from(auditLog).where(eq(auditLog.entityId, entityId));
    expect(rows).toEqual([
      expect.objectContaining({ actorId: fx.users.elena, action: "request.view" }),
    ]);
  });
});
