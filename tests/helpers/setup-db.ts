import { afterAll } from "vitest";
import { unfreezeTime } from "./clock";
import { closeDb } from "@/server/db";

// Общая настройка наборов с БД: после каждого файла — разморозить часы и закрыть пул соединений.
afterAll(async () => {
  unfreezeTime();
  await closeDb();
});
