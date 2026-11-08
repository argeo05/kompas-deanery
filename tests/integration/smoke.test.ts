import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

// Нужна БД: pnpm db:up && pnpm db:migrate.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL не задан — скопируйте .env.example в .env");
const sql = postgres(url, { max: 1 });

describe("smoke: integration", () => {
  afterAll(() => sql.end());

  it("PostgreSQL 16 доступен и миграции применены", async () => {
    const [{ server_version: version }] = await sql<
      { server_version: string }[]
    >`SHOW server_version`;
    expect(version.startsWith("16")).toBe(true);

    const [{ exists }] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'drizzle') AS exists`;
    expect(exists).toBe(true);
  });
});
