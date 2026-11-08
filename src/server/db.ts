import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";

// Только подключение. withUserTx (SET LOCAL app.user_id для RLS) — в сессии про схему и авторизацию.
let client: ReturnType<typeof postgres> | undefined;

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL не задан");
  client ??= postgres(url, { max: 10 });
  return drizzle(client, { schema });
}
