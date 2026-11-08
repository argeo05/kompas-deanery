import { addDaysMsk, mskParts, startOfDayMsk, toMskDate } from "@/lib/time";

// Работа с календарными днями Москвы для экрана расписания. Дни — строки «2026-11-12».

export const isIsoDate = (s: string | null | undefined): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export function addDays(iso: string, days: number): string {
  return toMskDate(addDaysMsk(startOfDayMsk(iso), days));
}

/** Понедельник недели, в которую попадает день. */
export function mondayOf(iso: string): string {
  return addDays(iso, -(mskParts(startOfDayMsk(iso)).weekday - 1));
}

/** Семь дней недели с понедельника. */
export function weekDays(iso: string): string[] {
  const monday = mondayOf(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Число месяца без нуля: «12». */
export const dayNumber = (iso: string) => String(Number(iso.slice(8, 10)));
