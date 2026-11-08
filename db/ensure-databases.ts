import "dotenv/config";
import postgres from "postgres";

// Досоздаёт базы на существующем томе docker-compose (init-скрипт работает только на пустом томе).
// Имена — фиксированный набор D-004 плюс базы из DATABASE_URL и TEST_DATABASE_URL.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL не задан");

const NAME_RE = /^[a-z0-9_]+$/;
const dbName = (u: string) => decodeURIComponent(new URL(u).pathname.replace(/^\//, ""));
const wanted = new Set([
  "kompas_dev",
  "kompas_test",
  "kompas_ds_test",
  "kompas_ds_dev",
  dbName(url),
]);
if (process.env.TEST_DATABASE_URL) wanted.add(dbName(process.env.TEST_DATABASE_URL));

const admin = new URL(url);
admin.pathname = "/postgres";
const sql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
const existing = new Set(
  (await sql<{ datname: string }[]>`SELECT datname FROM pg_database`).map((r) => r.datname),
);
const created: string[] = [];
for (const name of wanted) {
  if (existing.has(name)) continue;
  if (!NAME_RE.test(name)) throw new Error(`Недопустимое имя базы: ${name}`);
  await sql.unsafe(`CREATE DATABASE ${name}`);
  created.push(name);
}
await sql.end();
console.log(created.length ? `Созданы базы: ${created.join(", ")}` : "Все базы на месте");
