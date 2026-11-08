import "dotenv/config";
import postgres from "postgres";

// Полный сброс локальной БД: схемы public и drizzle (журнал миграций), затем миграции заново.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL не задан");
if (process.env.NODE_ENV === "production") throw new Error("db:reset запрещён в production");

const sql = postgres(url, { max: 1 });
await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
await sql`DROP SCHEMA IF EXISTS public CASCADE`;
await sql`CREATE SCHEMA public`;
await sql.end();
console.log("БД очищена");
