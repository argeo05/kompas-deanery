import type { ISODateTime, TimeWindow } from "@/contracts/api";
import { notImplemented } from "./not-implemented";

// DS-05. Свободные окна для планов «если–то» (SPEC §6.7 п.3, AC-7.1). Тесты: tests/unit/windows.test.ts.

/**
 * Окна без пар за `days` календарных дней начиная с московского дня `from`, не раньше самого `from`.
 * По умолчанию: окно ≥ 60 мин, учебный день 09:00–22:00 МСК. Результат по возрастанию времени.
 */
export function freeWindows(
  classes: Array<{ startsAt: ISODateTime; endsAt: ISODateTime }>,
  from: ISODateTime,
  days: number,
  opts?: { minMinutes?: number; dayStart?: string; dayEnd?: string },
): TimeWindow[] {
  return notImplemented("DS-05", classes, from, days, opts);
}
