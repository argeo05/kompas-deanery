import type { ISODateTime, NotificationClass } from "@/contracts/api";
import { mskDateTime, mskParts, toMsk } from "./time";

// DS-02. Слот дайджеста и момент доставки уведомления (SPEC §6.6, AC-6.3). Тесты: tests/unit/digest.test.ts.
//
// Правила (решение D-003):
// - время — московское; слоты и тихие часы — минуты от полуночи МСК;
// - slot(t) = min{ dⱼ : dⱼ ≥ t } с учётом секунд: 13:00:00 → 13:00, 13:00:30 → 19:00;
//   нет такого слота — первый слот следующего календарного дня (праздники не важны);
// - тихие часы [from, to): при from > to интервал идёт через полночь; слот внутри тихих часов пропускается;
// - urgent и категории из immediateCategories доставляются сразу, а в тихие часы — в момент их окончания;
// - ответ — ISODateTime +03:00, у слота секунды :00.

export type { NotificationClass };

const pad2 = (n: number) => String(Math.floor(n)).padStart(2, "0");

/** Минуты от полуночи → "HH:MM". */
function timeOfDay(minutes: number): string {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

/** Календарная дата + n дней → ISODate. */
function plusDays(date: string, n: number): string {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10);
}

/** Тихие ли минуты (от полуночи; [from, to), при from > to — через полночь). */
function isQuiet(minutes: number, quiet: { from: number; to: number }): boolean {
  return quiet.from <= quiet.to
    ? minutes >= quiet.from && minutes < quiet.to
    : minutes >= quiet.from || minutes < quiet.to;
}

/** Момент окончания тихих часов: сегодня в `to` или, если тихие часы длятся через полночь и ещё идут, завтра в `to`. */
function quietEnd(quiet: { from: number; to: number }, date: string, minutes: number): Date {
  if (quiet.from > quiet.to && minutes >= quiet.from)
    return mskDateTime(plusDays(date, 1), timeOfDay(quiet.to));
  return mskDateTime(date, timeOfDay(quiet.to));
}

/** Ближайший слот дайджеста ≥ createdAt (минуты от полуночи МСК); слоты внутри тихих часов пропускаются. */
export function digestSlot(
  createdAt: ISODateTime,
  slotsMinutes: number[],
  quiet: { from: number; to: number },
): ISODateTime {
  const p = mskParts(createdAt);
  const day = `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
  const nowSeconds = (p.hour * 60 + p.minute) * 60 + p.second;
  const slots = [...slotsMinutes].sort((a, b) => a - b);

  for (let offset = 0; offset < 40; offset++) {
    const cur = plusDays(day, offset);
    // В первый день берём слоты ≥ минуты момента; нет такого — первый слот следующего дня.
    let start = 0;
    if (offset === 0) {
      const first = slots.findIndex((s) => s * 60 >= nowSeconds);
      if (first === -1) continue;
      start = first;
    }
    for (let i = start; i < slots.length; i++) {
      const s = slots[i]!;
      if (!isQuiet(s, quiet)) return toMsk(mskDateTime(cur, timeOfDay(s)));
    }
  }
  // Сюда не доходим при разумной конфигурации (не все слоты внутри тихих часов).
  return toMsk(mskDateTime(plusDays(day, 1), timeOfDay(Math.min(...slots))));
}

/** urgent и категории из immediateCategories — сразу (после тихих часов); остальное — в слот дайджеста. */
export function deliveryTime(
  cls: NotificationClass,
  createdAt: ISODateTime,
  prefs: { slots: number[]; quietFrom: number; quietTo: number; immediateCategories: string[] },
  category: string,
): ISODateTime {
  const quiet = { from: prefs.quietFrom, to: prefs.quietTo };
  const immediate = cls === "urgent" || prefs.immediateCategories.includes(category);
  if (immediate) {
    const p = mskParts(createdAt);
    const minutes = p.hour * 60 + p.minute;
    if (!isQuiet(minutes, quiet)) return toMsk(createdAt);
    return toMsk(quietEnd(quiet, `${p.year}-${pad2(p.month)}-${pad2(p.day)}`, minutes));
  }
  return digestSlot(createdAt, prefs.slots, quiet);
}
