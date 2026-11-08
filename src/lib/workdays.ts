import type { ISODate, ISODateTime } from "@/contracts/api";
import { NON_WORKING_WEEKDAYS, WORKING_WEEKENDS } from "../../config/holidays";
import { mskDateTime, mskParts, toMsk, toMskDate } from "./time";

// DS-01. Рабочие дни и срок готовности заявки (SPEC §6.5 п.6, AC-5.7).
// Праздники и рабочие субботы — только из config/holidays.ts. Тесты: tests/unit/workdays.test.ts.
//
// Правила (решение D-003):
// - рабочий день: пн–пт, кроме NON_WORKING_WEEKDAYS, плюс WORKING_WEEKENDS;
// - день подачи: московский день подачи, если он рабочий и время ≤ 17:00:00 МСК, иначе следующий рабочий;
// - срок = 18:00 МСК N-го рабочего дня после дня подачи (сам день подачи не считается);
// - workdaysBetween(a, b): рабочие дни d, у которых день(a) < d ≤ день(b); при b < a — со знаком минус.

const NON_WORKING = new Set(NON_WORKING_WEEKDAYS);
const WORKING_WEEKENDS_SET = new Set(WORKING_WEEKENDS);

/** Календарная дата + 1 день → ISODate. */
function nextDate(date: ISODate): ISODate {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d + 1)).toISOString().slice(0, 10);
}

function prevDate(date: ISODate): ISODate {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d - 1)).toISOString().slice(0, 10);
}

/** Рабочий ли день (московская календарная дата). */
export function isWorkday(date: ISODate): boolean {
  if (NON_WORKING.has(date)) return false;
  if (WORKING_WEEKENDS_SET.has(date)) return true;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 — вс … 6 — сб
  return weekday >= 1 && weekday <= 5;
}

function nextWorkday(date: ISODate): ISODate {
  let cur = nextDate(date);
  while (!isWorkday(cur)) cur = nextDate(cur);
  return cur;
}

function prevWorkday(date: ISODate): ISODate {
  let cur = prevDate(date);
  while (!isWorkday(cur)) cur = prevDate(cur);
  return cur;
}

/** Срок готовности: 18:00 МСК N-го рабочего дня после дня подачи. Подача после 17:00 — следующим рабочим днём. */
export function addWorkdays(from: ISODateTime, days: number): ISODateTime {
  const p = mskParts(from);
  const secondsOfDay = p.hour * 3600 + p.minute * 60 + p.second;
  let cur = toMskDate(from);
  if (!isWorkday(cur) || secondsOfDay > 17 * 3600) cur = nextWorkday(cur);
  for (let n = days; n > 0; n--) cur = nextWorkday(cur);
  for (let n = days; n < 0; n++) cur = prevWorkday(cur);
  return toMsk(mskDateTime(cur, "18:00"));
}

/** Число рабочих дней d с день(a) < d ≤ день(b) по московскому календарю; при b < a — со знаком минус. */
export function workdaysBetween(a: ISODateTime, b: ISODateTime): number {
  const dayA = toMskDate(a);
  const dayB = toMskDate(b);
  if (dayA === dayB) return 0;
  const sign = dayB > dayA ? 1 : -1;
  const [start, end] = sign > 0 ? [dayA, dayB] : [dayB, dayA];
  let count = 0;
  for (let cur = nextDate(start); cur <= end; cur = nextDate(cur)) {
    if (isWorkday(cur)) count++;
  }
  return sign * count;
}
