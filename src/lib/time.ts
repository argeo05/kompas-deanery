import { now } from "./clock";

// Время в бизнес-логике и в API — московское (CLAUDE.md, SPEC §8). В БД — timestamptz (UTC).
// ISODateTime в ответах API — с явным смещением: "2026-11-12T09:30:00+03:00".

export const MSK = "Europe/Moscow";

const partsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: MSK,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZoneName: "longOffset",
});

export interface MskParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** Смещение от UTC в минутах (для Москвы +180). */
  offsetMinutes: number;
  /** День недели ISO: 1 — понедельник … 7 — воскресенье. */
  weekday: number;
}

function toDate(value: Date | string): Date {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) throw new RangeError(`Некорректная дата: ${String(value)}`);
  return d;
}

/** Календарные части момента времени в поясе Europe/Moscow. */
export function mskParts(value: Date | string): MskParts {
  const d = toDate(value);
  const p = Object.fromEntries(partsFormat.formatToParts(d).map((x) => [x.type, x.value]));
  const m = /GMT(?:([+-])(\d{2}):(\d{2}))?/.exec(p.timeZoneName ?? "");
  const offsetMinutes = m?.[1] ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  const year = Number(p.year);
  const month = Number(p.month);
  const day = Number(p.day);
  const weekday = ((new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7) + 1;
  return {
    year,
    month,
    day,
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    offsetMinutes,
    weekday,
  };
}

const pad = (n: number, len = 2) => String(Math.abs(n)).padStart(len, "0");

/** Момент времени → ISODateTime в Москве: "2026-11-12T09:30:00+03:00". */
export function toMsk(value: Date | string): string {
  const p = mskParts(value);
  const sign = p.offsetMinutes < 0 ? "-" : "+";
  const off = `${sign}${pad(Math.trunc(p.offsetMinutes / 60))}:${pad(p.offsetMinutes % 60)}`;
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${off}`;
}

/** Момент времени → ISODate московского календарного дня: "2026-11-12". */
export function toMskDate(value: Date | string): string {
  const p = mskParts(value);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Текущее время в Москве как ISODateTime. */
export function nowMsk(): string {
  return toMsk(now());
}

/**
 * Полночь московского дня, в который попадает момент (по умолчанию — сейчас).
 * Принимает и ISODate ("2026-11-12"): такая строка трактуется как московский календарный день.
 */
export function startOfDayMsk(value: Date | string = now()): Date {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return mskDateTime(value, "00:00");
  }
  const p = mskParts(value);
  return new Date(Date.UTC(p.year, p.month - 1, p.day) - p.offsetMinutes * 60_000);
}

/** Московские дата и время → момент. mskDateTime("2026-11-12", "09:30"). */
export function mskDateTime(date: string, time: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Смещение берём для самого момента: у Москвы оно постоянное (+03:00), но не хардкодим.
  const offset = mskParts(new Date(guess)).offsetMinutes;
  return new Date(guess - offset * 60_000);
}

/** Сдвиг на n календарных дней по московскому календарю (время суток сохраняется). */
export function addDaysMsk(value: Date | string, days: number): Date {
  const p = mskParts(value);
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  const iso = date.toISOString().slice(0, 10);
  return new Date(mskDateTime(iso, `${pad(p.hour)}:${pad(p.minute)}`).getTime() + p.second * 1000);
}
