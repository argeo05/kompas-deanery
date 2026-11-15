import { sql } from "drizzle-orm";
import { seed } from "./seed";
import type { SeedDb } from "./demo-accounts";

// Полный пересев демо-данных (D-015, D-017). Общий код для демо-сброса из API и ночного
// скрипта scripts/nightly-reseed.ts. Без `server-only`: скрипт запускается через tsx.

/** Таблицы, которые сброс не трогает: счётчики лимитов не должны обнуляться (защита от подбора). */
export const KEEP_TABLES = new Set(["rate_limits"]);

export async function truncateAndSeed(db: SeedDb, base?: Date): Promise<void> {
  await db.transaction(async (tx) => {
    // Один сброс на весь кластер (на случай нескольких реплик); блокировка снимается с транзакцией.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(8_008_001)`);
    const tables = await tx.execute<{ name: string }>(
      sql`SELECT quote_ident(tablename) AS name FROM pg_tables WHERE schemaname = 'public'`,
    );
    const wipe = tables.filter((t) => !KEEP_TABLES.has(t.name));
    if (wipe.length > 0) {
      await tx.execute(
        sql.raw(
          `TRUNCATE ${wipe.map((t) => `public.${t.name}`).join(", ")} RESTART IDENTITY CASCADE`,
        ),
      );
    }
    const sequences = await tx.execute<{ name: string }>(
      sql`SELECT quote_ident(sequencename) AS name FROM pg_sequences WHERE schemaname = 'public'`,
    );
    for (const s of sequences) await tx.execute(sql.raw(`ALTER SEQUENCE public.${s.name} RESTART`));
    await seed(tx as unknown as SeedDb, base);
  });
}
