import * as schema from "../schema";
import { seedDates } from "./dates";
import { seedDemoAccounts, type SeedDb } from "./demo-accounts";
import { REQUEST_TYPES } from "./request-types";

// Наполнение пустой БД (после миграций или resetDb в тестах). Порядок: справочники → демо-аккаунты → популяция.
// Фоновая популяция (DS-40) подключается здесь же, после демо-аккаунтов.

export async function seed(db: SeedDb, base?: Date) {
  const dates = seedDates(base);
  await db
    .insert(schema.requestTypes)
    .values(REQUEST_TYPES.map((t, i) => ({ ...t, sortOrder: i })));
  return seedDemoAccounts(db, dates);
}
