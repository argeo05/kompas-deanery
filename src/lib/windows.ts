import type { ISODateTime, TimeWindow } from "@/contracts/api";
import { mskDateTime, mskParts, toMsk } from "./time";

// DS-05. Свободные окна для планов «если–то» (SPEC §6.7 п.3, AC-7.1). Тесты: tests/unit/windows.test.ts.
//
// - рассматриваются `days` календарных дней подряд от московского дня `from` (суббота тоже);
// - в каждом дне окно — [dayStart, dayEnd] (по умолчанию 09:00–22:00 МСК) за вычетом пар;
// - пары могут пересекаться и идти не по порядку — объединяются;
// - окно не начинается раньше `from`; короче minMinutes (по умолчанию 60) отбрасываются;
// - результат по возрастанию, ISODateTime +03:00.

const pad2 = (n: number) => String(Math.floor(n)).padStart(2, "0");

function plusDays(date: string, n: number): string {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10);
}

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
  const minMs = (opts?.minMinutes ?? 60) * 60_000;
  const dayStart = opts?.dayStart ?? "09:00";
  const dayEnd = opts?.dayEnd ?? "22:00";
  const fromMs = new Date(from).getTime();
  const p = mskParts(from);
  const baseDate = `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;

  const windows: TimeWindow[] = [];
  for (let i = 0; i < days; i++) {
    const date = plusDays(baseDate, i);
    const dayEndMs = mskDateTime(date, dayEnd).getTime();
    const startMs = Math.max(mskDateTime(date, dayStart).getTime(), fromMs);
    if (startMs >= dayEndMs) continue;

    // Пласты пересекающихся пар ужимаются в отсортированные непересекающиеся интервалы.
    const busy = classes
      .map((c) => ({ s: new Date(c.startsAt).getTime(), e: new Date(c.endsAt).getTime() }))
      .filter((c) => c.s < dayEndMs && c.e > startMs)
      .sort((a, b) => a.s - b.s);
    const merged: Array<{ s: number; e: number }> = [];
    for (const c of busy) {
      const last = merged.at(-1);
      if (last && c.s <= last.e) last.e = Math.max(last.e, c.e);
      else merged.push({ ...c });
    }

    let cursor = startMs;
    for (const c of merged) {
      if (c.s - cursor >= minMs)
        windows.push({ startsAt: toMsk(new Date(cursor)), endsAt: toMsk(new Date(c.s)) });
      cursor = Math.max(cursor, c.e);
    }
    if (dayEndMs - cursor >= minMs)
      windows.push({ startsAt: toMsk(new Date(cursor)), endsAt: toMsk(new Date(dayEndMs)) });
  }
  return windows;
}
