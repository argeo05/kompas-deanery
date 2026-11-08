import type { ClassDTO, Hero, ISODateTime, ScheduleChangeDTO } from "@/contracts/api";
import { notImplemented } from "./not-implemented";

// DS-07. Hero-карточка главной «Сегодня» (порядок приоритета SPEC §6.2, AC-2.2; решение D-003).
// Тесты: tests/unit/today.test.ts.

export type { Hero };

/**
 * todayClasses — пары московского дня `now` (startsAt уже с учётом переноса, change — изменение пары).
 * unseenChanges — изменения на сегодня, которые студент ещё не видел.
 * nextClassAt — начало ближайшей пары после сегодняшнего дня (для done_today и day_off).
 */
export function pickHero(
  now: ISODateTime,
  todayClasses: ClassDTO[],
  unseenChanges: ScheduleChangeDTO[],
  nextClassAt: ISODateTime | null,
): Hero {
  return notImplemented("DS-07", now, todayClasses, unseenChanges, nextClassAt);
}
