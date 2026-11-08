// Единственный источник текущего времени для бизнес-логики (DEEPSEEK-TASKS §2).
// В логике не пишем `new Date()` без аргументов — только now(). Тесты подменяют время через
// freezeTime() из tests/helpers, не трогая системные часы.

let frozen: Date | null = null;

export function now(): Date {
  return frozen ? new Date(frozen.getTime()) : new Date();
}

/** Только для тестов. В production заморозка запрещена. */
export const __clock = {
  freeze(at: Date) {
    if (process.env.NODE_ENV === "production")
      throw new Error("Заморозка времени запрещена в production");
    frozen = new Date(at.getTime());
  },
  reset() {
    frozen = null;
  },
};
