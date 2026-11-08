import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { idempotencyKeys, icsTokens } from "../../../db/schema";
import { now } from "@/lib/clock";
import type { Tx } from "../db";

// Репозиторий токенов календаря ICS (DS-22).
// В ics_tokens хранится ТОЛЬКО SHA-256 токена (SPEC §6.9 — единственный
// неаутентифицированный endpoint с личными данными). Из хеша токен не восстановить,
// поэтому ссылка для повторного показа GET /api/me/ics кэшируется в idempotency_keys
// (ключ FEED_TOKEN_CACHE_KEY); rotate перезаписывает обе строки в одной транзакции.
// Подробно — docs/ds-questions/DS-22.md.

/** Ключ кэша ссылки в idempotency_keys (формат по KEY_RE из src/server/idempotency.ts). */
export const FEED_TOKEN_CACHE_KEY = "ics-feed-url";

/** Хеш запроса кэшируемого ответа: метод и его путь. */
export const FEED_TOKEN_REQUEST_HASH = createHash("sha256").update("GET /api/me/ics").digest("hex");

/** Свежий токен: 256 бит случайности (32 байта) в base64url — коротко и безопасно в URL. */
export function generateFeedToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 токена — ровно то, что лежит в ics_tokens.token_hash. */
export function feedTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Относительная ссылка-подписка; origin подставляет интерфейс (см. docs/ds-questions/DS-22.md). */
export function feedUrl(token: string): string {
  return `/api/ics/${token}.ics`;
}

/** Текущий хеш токена студента; null — подписка ещё не создавалась. */
export async function findTokenHashByUserId(tx: Tx, userId: string): Promise<string | null> {
  const [row] = await tx
    .select({ tokenHash: icsTokens.tokenHash })
    .from(icsTokens)
    .where(eq(icsTokens.userId, userId))
    .limit(1);
  return row?.tokenHash ?? null;
}

/**
 * Владелец подписки по хешу токена — для публичного /api/ics/:token (DS-22), как
 * findDocumentByTokenHash для /api/verify (DS-23). Роль kompas_app сюда не пускали бы:
 * вызывается соединением владельца, без uid'а сессии. Возвращает только userId —
 * сами пары читаются дальше строго внутри withUserTx этого владельца.
 */
export async function findUserIdByTokenHash(tx: Tx, tokenHash: string): Promise<string | null> {
  const [row] = await tx
    .select({ userId: icsTokens.userId })
    .from(icsTokens)
    .where(eq(icsTokens.tokenHash, tokenHash))
    .limit(1);
  return row?.userId ?? null;
}

/**
 * Записать хеш токена владельца: один токен на студента (первичный ключ user_id).
 * Rotate перезаписывает — прежний токен перестаёт находимым быть и его корм 404.
 */
export async function putTokenHash(tx: Tx, userId: string, tokenHash: string): Promise<void> {
  await tx
    .insert(icsTokens)
    .values({ userId, tokenHash, createdAt: now() })
    .onConflictDoUpdate({ target: icsTokens.userId, set: { tokenHash, createdAt: now() } });
}

/**
 * Токен из кэша ссылки (idempotency_keys): памятует сырой токен, чтобы повторный
 * GET /api/me/ics вернул ту же ссылку. null — кэша нет/испорчен.
 */
export async function findCachedFeedToken(tx: Tx, userId: string): Promise<string | null> {
  const [row] = await tx
    .select({ statusCode: idempotencyKeys.statusCode, response: idempotencyKeys.response })
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, FEED_TOKEN_CACHE_KEY)))
    .limit(1);
  if (row?.statusCode !== 200) return null;
  const token = (row.response as { token?: unknown } | null)?.token;
  return typeof token === "string" ? token : null;
}

/** Запомнить токен в кэше ответа GET /api/me/ics (в той же транзакции, что и ics_tokens). */
export async function putCachedFeedToken(tx: Tx, userId: string, token: string): Promise<void> {
  const response = sql`${JSON.stringify({ token })}::jsonb`;
  await tx
    .insert(idempotencyKeys)
    .values({
      userId,
      key: FEED_TOKEN_CACHE_KEY,
      requestHash: FEED_TOKEN_REQUEST_HASH,
      statusCode: 200,
      response,
      createdAt: now(),
    })
    .onConflictDoUpdate({
      target: [idempotencyKeys.userId, idempotencyKeys.key],
      set: { statusCode: 200, response, createdAt: now() },
    });
}
