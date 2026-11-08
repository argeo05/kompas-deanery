import "dotenv/config";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";
import { seed } from "./seed";

// pnpm db:seed — наполняет БД после `pnpm db:reset` (SPEC §11). Повторный запуск на непустой БД запрещён.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL не задан");

const client = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema });
const [{ n }] = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM users`);
if (n > 0) {
  await client.end();
  throw new Error("БД уже засеяна — сначала pnpm db:reset");
}
const started = Date.now();
await seed(db);
await client.end();
console.log(`Сид готов за ${((Date.now() - started) / 1000).toFixed(1)} с`);
