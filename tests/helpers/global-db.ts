import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { databaseName, requireTestDatabaseUrl } from "./test-db-url";

// globalSetup наборов integration и security: проверить, что база тестовая, и применить к ней миграции.
// Наборы могут стартовать одновременно, поэтому миграции идут под advisory-локом.

const MIGRATION_LOCK = 20261108;

export default async function setup() {
  const url = requireTestDatabaseUrl();
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await client`SELECT pg_advisory_lock(${MIGRATION_LOCK})`;
    await migrate(drizzle(client), { migrationsFolder: "db/migrations" });
    await client`SELECT pg_advisory_unlock(${MIGRATION_LOCK})`;
  } catch (err) {
    throw new Error(
      `Тестовая база ${databaseName(url)} недоступна или миграции не применились. ` +
        "Поднимите БД: pnpm db:up (создаёт kompas_dev, kompas_test, kompas_ds_test).",
      { cause: err },
    );
  } finally {
    await client.end();
  }
}
