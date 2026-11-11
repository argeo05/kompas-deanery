import "server-only";
import { sql } from "drizzle-orm";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { seed } from "@db/seed/seed";
import type { SeedDb } from "@db/seed/demo-accounts";
import { now } from "@/lib/clock";
import { getDb } from "../db";

// Сброс демо-данных (SPEC §6.1 «Тонкости», §6.9 п.6, §6.12, D-015). Вся база Компаса — вымышленные
// данные, поэтому сброс возвращает её целиком к сиду: даты пересчитываются от сегодняшнего дня.
// Все сеансы закрываются — входить нужно заново (пароли демо-аккаунтов публичны на /jury).

/** Не чаще раза в 5 минут на весь сервис: сброс общий для всех, второй подряд бессмыслен. */
const globalLimit = new RateLimiterMemory({ points: 1, duration: 300 });
/** И не чаще раза в 5 минут с одного адреса — чтобы один посетитель не занимал окно у остальных. */
const ipLimit = new RateLimiterMemory({ points: 1, duration: 300 });

export type ResetResult = { ok: true; resetAt: string } | { ok: false; retryAfterSec: number };

let running: Promise<void> | null = null;

export async function resetDemoData(ip: string): Promise<ResetResult> {
  try {
    await ipLimit.consume(ip);
  } catch (e) {
    return {
      ok: false,
      retryAfterSec: Math.ceil(((e as { msBeforeNext?: number }).msBeforeNext ?? 300_000) / 1000),
    };
  }
  try {
    await globalLimit.consume("all");
  } catch (e) {
    await ipLimit.reward(ip);
    return {
      ok: false,
      retryAfterSec: Math.ceil(((e as { msBeforeNext?: number }).msBeforeNext ?? 300_000) / 1000),
    };
  }
  running ??= truncateAndSeed().finally(() => {
    running = null;
  });
  await running;
  return { ok: true, resetAt: now().toISOString() };
}

async function truncateAndSeed(): Promise<void> {
  await getDb().transaction(async (tx) => {
    // Один сброс на весь кластер (на случай нескольких реплик); блокировка снимается с транзакцией.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(8_008_001)`);
    const tables = await tx.execute<{ name: string }>(
      sql`SELECT quote_ident(tablename) AS name FROM pg_tables WHERE schemaname = 'public'`,
    );
    if (tables.length > 0) {
      await tx.execute(
        sql.raw(
          `TRUNCATE ${tables.map((t) => `public.${t.name}`).join(", ")} RESTART IDENTITY CASCADE`,
        ),
      );
    }
    const sequences = await tx.execute<{ name: string }>(
      sql`SELECT quote_ident(sequencename) AS name FROM pg_sequences WHERE schemaname = 'public'`,
    );
    for (const s of sequences) await tx.execute(sql.raw(`ALTER SEQUENCE public.${s.name} RESTART`));
    await seed(tx as unknown as SeedDb);
  });
}

/** Для тестов: сбросить счётчики лимитов. */
export async function __resetLimits(ip: string) {
  await ipLimit.delete(ip);
  await globalLimit.delete("all");
}
