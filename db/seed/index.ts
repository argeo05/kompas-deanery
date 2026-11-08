import "dotenv/config";
import postgres from "postgres";

// Точка входа сида. Наполнение (SPEC §11, DS-40…42) — в следующих сессиях.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL не задан");

const sql = postgres(url, { max: 1 });
await sql`SELECT 1`;
await sql.end();
console.log("Сид: пока нечего засеивать");
