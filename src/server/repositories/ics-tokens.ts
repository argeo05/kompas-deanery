import "server-only";
import { createHash, createHmac } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { icsTokens } from "../../../db/schema";
import { now } from "@/lib/clock";
import { serverSecret } from "../services/verify-code";
import type { Tx } from "../db";

// Репозиторий токенов календаря ICS (DS-22, ревью Claude).
// Токен не хранится нигде: он выводится из (userId, generation) и серверного секрета,
// поэтому GET /api/me/ics повторно показывает ту же ссылку, а выгрузка БД ссылок не даёт.
// В ics_tokens — SHA-256 токена (поиск публичным роутом) и поколение; rotate → generation + 1.

/** Формат токена: HMAC-SHA256 в base64url — ровно 43 символа. */
export const FEED_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** Токен поколения generation: 256 бит HMAC, в URL безопасен. */
export function deriveFeedToken(userId: string, generation: number): string {
  return createHmac("sha256", serverSecret())
    .update(`ics:${userId}:${generation}`)
    .digest("base64url");
}

/** SHA-256 токена — ровно то, что лежит в ics_tokens.token_hash. */
export function feedTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Относительная ссылка-подписка; origin подставляет интерфейс (см. docs/ds-questions/DS-22.md). */
export function feedUrl(token: string): string {
  return `/api/ics/${token}.ics`;
}

/** Текущее поколение ссылки студента; null — подписка ещё не создавалась. */
export async function findFeedGeneration(tx: Tx, userId: string): Promise<number | null> {
  const [row] = await tx
    .select({ generation: icsTokens.generation })
    .from(icsTokens)
    .where(eq(icsTokens.userId, userId))
    .limit(1);
  return row?.generation ?? null;
}

/**
 * Владелец подписки по хешу токена — для публичного /api/ics/:token (DS-22), как
 * findDocumentByTokenHash для /api/verify (DS-23). Вызывается соединением владельца,
 * без uid'а сессии. Возвращает только userId — пары читаются дальше внутри withUserTx.
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
 * Создать подписку (generation 1) или перейти к следующему поколению: прежний токен
 * перестаёт находиться — его корм 404. Возвращает новое поколение.
 */
export async function bumpFeedGeneration(tx: Tx, userId: string): Promise<number> {
  const current = await findFeedGeneration(tx, userId);
  const generation = (current ?? 0) + 1;
  const tokenHash = feedTokenHash(deriveFeedToken(userId, generation));
  await tx
    .insert(icsTokens)
    .values({ userId, tokenHash, generation, createdAt: now() })
    .onConflictDoUpdate({
      target: icsTokens.userId,
      set: { tokenHash, generation: sql`excluded.generation`, createdAt: now() },
    });
  return generation;
}
