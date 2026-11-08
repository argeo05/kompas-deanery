import { now } from "../../src/lib/clock";
import { addDaysMsk, mskDateTime, mskParts, startOfDayMsk, toMskDate } from "../../src/lib/time";

// «Живые» даты сида (SPEC §11.3): всё считается от сегодняшнего дня по Москве, а не от констант.
// В тестах «сегодня» задаёт freezeTime() до resetDb().

export interface SeedDates {
  /** Сегодня 00:00 МСК. */
  today: Date;
  /** ISODate дня со сдвигом: day(-1) — вчера. */
  day(offset: number): string;
  /** Момент: at(-1, "10:15") — вчера в 10:15 МСК. */
  at(offset: number, time: string): Date;
  /** Ближайший учебный день (пн–сб) начиная с сегодняшнего: сдвиг в днях. */
  nextStudyDayOffset(): number;
}

export function seedDates(base: Date = now()): SeedDates {
  const today = startOfDayMsk(base);
  const day = (offset: number) => toMskDate(addDaysMsk(today, offset));
  return {
    today,
    day,
    at: (offset, time) => mskDateTime(day(offset), time),
    nextStudyDayOffset: () => (mskParts(today).weekday === 7 ? 1 : 0),
  };
}
