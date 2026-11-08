import type { ISODate, ISODateTime } from "@/contracts/api";
import { notImplemented } from "./not-implemented";

// DS-01. Рабочие дни и срок готовности заявки (SPEC §6.5 п.6, AC-5.7).
// Праздники и рабочие субботы — только из config/holidays.ts. Тесты: tests/unit/workdays.test.ts.

/** Рабочий ли день (московская календарная дата). */
export function isWorkday(date: ISODate): boolean {
  return notImplemented("DS-01", date);
}

/** Срок готовности: 18:00 МСК N-го рабочего дня после дня подачи. Подача после 17:00 — следующим рабочим днём. */
export function addWorkdays(from: ISODateTime, days: number): ISODateTime {
  return notImplemented("DS-01", from, days);
}

/** Число рабочих дней d с день(a) < d ≤ день(b) по московскому календарю; при b < a — со знаком минус. */
export function workdaysBetween(a: ISODateTime, b: ISODateTime): number {
  return notImplemented("DS-01", a, b);
}
