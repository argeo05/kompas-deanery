// Человеческие даты и время для интерфейса (SPEC §7.6): всегда в Europe/Moscow (CLAUDE.md).
import { MSK } from "./time";

const timeFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: MSK,
  hour: "2-digit",
  minute: "2-digit",
});

/** «08:14» по Москве. */
export function formatTimeMsk(value: Date | string): string {
  return timeFormat.format(typeof value === "string" ? new Date(value) : value);
}

const dateLongFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: MSK,
  weekday: "long",
  day: "numeric",
  month: "long",
});
const dayMonthFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: MSK,
  day: "numeric",
  month: "short",
});
const dayMonthFullFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: MSK,
  day: "numeric",
  month: "long",
});
const weekdayShortFormat = new Intl.DateTimeFormat("ru-RU", { timeZone: MSK, weekday: "short" });
const weekdayLongFormat = new Intl.DateTimeFormat("ru-RU", { timeZone: MSK, weekday: "long" });

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const asDate = (value: Date | string) => (typeof value === "string" ? new Date(value) : value);

/** «Четверг, 12 ноября» по Москве. */
export function formatDateLong(value: Date | string): string {
  return upperFirst(dateLongFormat.format(asDate(value)));
}

/** «12 ноя» — короткая дата без точки в конце. */
export function formatDayMonth(value: Date | string): string {
  return dayMonthFormat.format(asDate(value)).replace(/\.$/, "");
}

/** «12 ноября». */
export function formatDayMonthFull(value: Date | string): string {
  return dayMonthFullFormat.format(asDate(value));
}

/** «чт» и «четверг». */
export function formatWeekdayShort(value: Date | string): string {
  return weekdayShortFormat.format(asDate(value)).replace(/\.$/, "");
}
export function formatWeekdayLong(value: Date | string): string {
  return weekdayLongFormat.format(asDate(value));
}

/** Длительность в минутах человеческими словами: «32 мин», «1 ч 40 мин», «2 ч». */
export function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

/** Склонение по числу: plural(2, ["пара", "пары", "пар"]) → «пары». */
export function plural(n: number, forms: [one: string, few: string, many: string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

/** «завтра в 23:59», «сегодня в 18:00», «чт, 12 ноя в 09:30» — срок или момент по-человечески. */
export function formatWhen(value: Date | string, nowValue: Date): string {
  const target = asDate(value);
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: MSK }).format(d);
  const diffDays = Math.round(
    (Date.parse(day(target)) - Date.parse(day(nowValue))) / (24 * 3600_000),
  );
  const time = formatTimeMsk(target);
  if (diffDays === 0) return `сегодня в ${time}`;
  if (diffDays === 1) return `завтра в ${time}`;
  if (diffDays === -1) return `вчера в ${time}`;
  return `${formatWeekdayShort(target)}, ${formatDayMonth(target)} в ${time}`;
}

/**
 * «обновлено только что», «обновлено 12 мин назад», «обновлено вчера в 08:14» — свежесть данных
 * (SPEC §6.13: время последнего успешного обновления, а не последней попытки).
 */
export function formatUpdatedAgo(at: number | Date, nowValue: Date): string {
  const target = typeof at === "number" ? new Date(at) : at;
  const minutes = Math.floor((nowValue.getTime() - target.getTime()) / 60_000);
  if (minutes < 1) return "обновлено только что";
  if (minutes < 60) return `обновлено ${minutes} мин назад`;
  return `обновлено ${formatWhen(target, nowValue)}`;
}

const scoreFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

/** Баллы с десятичной запятой: «11,5», «24». */
export function formatScore(value: number): string {
  return scoreFormat.format(value);
}

/** Доля 0,87 → «87%» (вверх: «нужно 86,2%» честнее показать как 87%). */
export function formatNeedShare(share: number): string {
  return `${Math.ceil(share * 100 - 1e-9)}%`;
}
