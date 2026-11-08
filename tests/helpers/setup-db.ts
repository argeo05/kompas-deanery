import { afterAll } from "vitest";
import { unfreezeTime } from "./clock";
import { closeDb } from "@/server/db";

// Общая настройка наборов с БД. Страховка к globalSetup: воркер подключается только к TEST_DATABASE_URL.
if (!process.env.DATABASE_URL || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) {
  throw new Error(
    "Наборы с БД запускаются только на TEST_DATABASE_URL (vitest.config.ts → dbProject)",
  );
}

// После каждого файла — разморозить часы и закрыть пул соединений.
afterAll(async () => {
  unfreezeTime();
  await closeDb();
});
