/**
 * Заглушка тикета DeepSeek: сигнатура зафиксирована, реализации ещё нет (TDD, DEEPSEEK-TASKS §4).
 * Аргументы передаются, чтобы заглушка не нарушала no-unused-vars; в сообщение они не попадают.
 * Когда тикет готов, вызовов не остаётся — тогда файл удаляет Claude при ревью.
 */
export function notImplemented(ticket: string, ...args: unknown[]): never {
  void args;
  throw new Error(`${ticket}: не реализовано`);
}
