import { sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { seed } from "@db/seed/seed";
import { loadFixtures, type Fixtures } from "./fixtures";

// resetDb(): очищает все таблицы public, сбрасывает последовательности и заново засевает
// данные тем же сидом, что и `pnpm db:seed`. Даты сида — от now() (src/lib/clock.ts),
// поэтому freezeTime() вызывайте до resetDb().

const sessionResetListeners: Array<() => void> = [];
export function onSessionsReset(fn: () => void) {
  sessionResetListeners.push(fn);
}

export async function resetDb(): Promise<Fixtures> {
  const db = getDb();
  const tables = await db.execute<{ name: string }>(
    sql`SELECT quote_ident(tablename) AS name FROM pg_tables WHERE schemaname = 'public'`,
  );
  if (tables.length > 0) {
    await db.execute(
      sql.raw(
        `TRUNCATE ${tables.map((t) => `public.${t.name}`).join(", ")} RESTART IDENTITY CASCADE`,
      ),
    );
  }
  const sequences = await db.execute<{ name: string }>(
    sql`SELECT quote_ident(sequencename) AS name FROM pg_sequences WHERE schemaname = 'public'`,
  );
  for (const s of sequences) await db.execute(sql.raw(`ALTER SEQUENCE public.${s.name} RESTART`));
  sessionResetListeners.forEach((fn) => fn());
  await seed(db);
  return loadFixtures();
}
