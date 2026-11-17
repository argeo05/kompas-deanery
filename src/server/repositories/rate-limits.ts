import "server-only";
import { sql } from "drizzle-orm";
import type { Db } from "../db";

// Окна «не чаще раза за N мс» в общей таблице rate_limits (D-017). Строки с префиксом `kompas:`
// не пересекаются с ключами Better Auth (`ip/путь`), а сам сброс демо-данных эту таблицу не трогает.

/** Занять окно атомарно. true — окно занято нами; false — ещё не истекло (retryAfterMs — сколько ждать). */
export async function claimWindow(
  db: Db,
  key: string,
  windowMs: number,
  nowMs: number,
): Promise<{ ok: true } | { ok: false; retryAfterMs: number }> {
  const claimed = await db.execute<{ key: string }>(sql`
    INSERT INTO rate_limits (key, count, last_request) VALUES (${key}, 1, ${nowMs})
    ON CONFLICT (key) DO UPDATE SET count = 1, last_request = ${nowMs}
      WHERE rate_limits.last_request <= ${nowMs - windowMs}
    RETURNING key`);
  if (claimed.length > 0) return { ok: true };
  const [row] = await db.execute<{ last_request: string }>(
    sql`SELECT last_request FROM rate_limits WHERE key = ${key}`,
  );
  const last = row ? Number(row.last_request) : nowMs;
  return { ok: false, retryAfterMs: Math.max(1000, last + windowMs - nowMs) };
}

/** Вернуть окно (операция не состоялась). */
export async function releaseWindow(db: Db, key: string): Promise<void> {
  await db.execute(sql`DELETE FROM rate_limits WHERE key = ${key}`);
}
