import "server-only";
import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";

// Подключение к PostgreSQL и транзакции с RLS (SPEC §9.3 п.3, DEEPSEEK-TASKS §2).
//
// getDb()   — соединение владельца БД: Better Auth, guards, сид. RLS не действует.
// withUserTx(userId, fn) — ВСЕ запросы к личным таблицам. Внутри транзакции:
//   SET LOCAL ROLE kompas_app            → действуют RLS-политики (db/migrations/0001_rls.sql);
//   set_config('app.user_id', userId)    → политики знают, кто спрашивает.
// Условие по владельцу в запросе всё равно обязательно: RLS — страховка, а не замена.

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Подписчики на выполненные запросы — для countQueries() в тестах (поиск N+1).
const queryListeners = new Set<(query: string) => void>();
export function addQueryListener(fn: (query: string) => void): () => void {
  queryListeners.add(fn);
  return () => queryListeners.delete(fn);
}

let client: ReturnType<typeof postgres> | undefined;
let db: Db | undefined;

export function getDb(): Db {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL не задан");
  client = postgres(url, { max: 10, onnotice: () => {} });
  db = drizzle(client, {
    schema,
    logger: { logQuery: (query) => queryListeners.forEach((fn) => fn(query)) },
  });
  return db;
}

export async function closeDb() {
  await client?.end({ timeout: 5 });
  client = undefined;
  db = undefined;
}

export async function withUserTx<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(userId)) throw new Error("withUserTx: userId должен быть UUID из сессии");
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
    await tx.execute(sql`SET LOCAL ROLE kompas_app`);
    return fn(tx);
  });
}
