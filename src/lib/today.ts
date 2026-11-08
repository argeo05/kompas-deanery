import type { ClassDTO, Hero, ISODateTime, ScheduleChangeDTO } from "@/contracts/api";

// DS-07. Hero-карточка главной «Сегодня» (порядок приоритета SPEC §6.2, AC-2.2; решение D-003).
// Тесты: tests/unit/today.test.ts.
//
// «Активная» пара — пара сегодня без изменения типа cancelled.
// 1. change — непросмотренное изменение пары, которая ещё не началась; из нескольких — самая ранняя пара.
// 2. now — идёт активная пара: startsAt ≤ now < endsAt.
// 3. soon — ближайшая активная пара начнётся не позже чем через 3 ч.
// 4. Активные пары ещё будут, но позже чем через 3 ч — day_off с началом ближайшей (D-003).
// 5. done_today — активные пары были и все закончились; nextClassAt из аргумента.
// 6. day_off — активных пар сегодня нет; nextClassAt из аргумента.

export type { Hero };

/** Порог «скоро» — 3 часа в миллисекундах. */
const SOON_MS = 3 * 60 * 60_000;

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
  const nowMs = new Date(now).getTime();

  // 1. Непросмотренное изменение ещё не начавшейся пары. Ища по id, так как классы
  //    могут не совпадать ссылкой с элементами unseenChanges.
  const unseenIds = new Set(unseenChanges.map((c) => c.id));
  const changeClass = todayClasses
    .filter((c) => c.change && unseenIds.has(c.change.id) && new Date(c.startsAt).getTime() > nowMs)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
  if (changeClass?.change)
    return { kind: "change", classId: changeClass.id, change: changeClass.change };

  const active = todayClasses.filter((c) => c.change?.type !== "cancelled");

  // 2. Идёт пара.
  const current = active.find(
    (c) => new Date(c.startsAt).getTime() <= nowMs && nowMs < new Date(c.endsAt).getTime(),
  );
  if (current) return { kind: "now", classId: current.id, endsAt: current.endsAt };

  // 3–4. Ближайшая активная пара: ≤ 3 ч — «скоро», позже — day_off с её началом.
  const next = active
    .filter((c) => new Date(c.startsAt).getTime() > nowMs)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
  if (next) {
    return new Date(next.startsAt).getTime() - nowMs <= SOON_MS
      ? { kind: "soon", classId: next.id, startsAt: next.startsAt }
      : { kind: "day_off", nextClassAt: next.startsAt };
  }

  // 5–6. Пары сегодня закончились или их не было.
  if (active.length > 0) return { kind: "done_today", nextClassAt };
  return { kind: "day_off", nextClassAt };
}
