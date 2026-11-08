import { __clock } from "@/lib/clock";
import { addQueryListener } from "@/server/db";

/**
 * Замораживает now() из src/lib/clock.ts. Возвращает функцию разморозки.
 * Таймеры и системные часы не трогает: драйвер БД продолжает работать.
 *   freezeTime("2026-11-12T09:30:00+03:00");
 */
export function freezeTime(iso: string): () => void {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) throw new Error(`freezeTime: некорректная дата ${iso}`);
  __clock.freeze(at);
  return unfreezeTime;
}

export function unfreezeTime() {
  __clock.reset();
}

/**
 * Считает SQL-запросы, выполненные через Drizzle за время fn (включая чтение сессии в guard-е).
 * Нужен для тестов «без N+1»: число запросов не должно расти вместе с объёмом данных.
 */
export async function countQueries<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; count: number; queries: string[] }> {
  const queries: string[] = [];
  const stop = addQueryListener((q) => queries.push(q));
  try {
    const result = await fn();
    return { result, count: queries.length, queries };
  } finally {
    stop();
  }
}
