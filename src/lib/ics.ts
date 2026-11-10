// Сборка календаря iCalendar по RFC 5545 (SPEC §6.3 п.7, AC-3.4). Пишем сами, а не через библиотеку:
// нужны VTIMEZONE Europe/Moscow и время с TZID (библиотека `ics` умеет только UTC и «плавающее» время,
// а Apple Calendar и Google по-разному читают плавающее). Москва с 2014 года на постоянных +03:00 без
// перехода, поэтому VTIMEZONE состоит из одного STANDARD.

export const TZID = "Europe/Moscow";
const MSK_OFFSET_MS = 3 * 3600_000;

export interface IcsEvent {
  /** Стабильный, не меняется при переносе: клиент обновляет событие, а не создаёт копию. */
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  location?: string;
  description?: string;
  status?: "CONFIRMED" | "CANCELLED";
  /** Растёт с каждой правкой события (число изменений): без него Google игнорирует обновления. */
  sequence?: number;
  /** Когда событие менялось в последний раз. */
  lastModified?: Date;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Локальное московское время в формате 20261112T124000. */
export function mskLocal(d: Date): string {
  const m = new Date(d.getTime() + MSK_OFFSET_MS);
  return `${pad(m.getUTCFullYear(), 4)}${pad(m.getUTCMonth() + 1)}${pad(m.getUTCDate())}T${pad(m.getUTCHours())}${pad(m.getUTCMinutes())}${pad(m.getUTCSeconds())}`;
}

export function utcStamp(d: Date): string {
  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Экранирование значения TEXT (RFC 5545 §3.3.11): \ ; , и переводы строк. */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Свёртка строк до 75 октетов (RFC 5545 §3.1), не разрезая многобайтные символы. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      parts.push(cur);
      cur = "";
      bytes = 0;
      limit = 74; // продолжение начинается с пробела
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

export function buildCalendar(opts: { name: string; events: IcsEvent[]; stamp: Date }): string {
  const L: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kompas//Concept MGIMO AI Challenge//RU",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(opts.name)}`,
    `X-WR-TIMEZONE:${TZID}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    "BEGIN:VTIMEZONE",
    `TZID:${TZID}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0300",
    "TZOFFSETTO:+0300",
    "TZNAME:MSK",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
  for (const e of opts.events) {
    L.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${utcStamp(opts.stamp)}`,
      `DTSTART;TZID=${TZID}:${mskLocal(e.start)}`,
      `DTEND;TZID=${TZID}:${mskLocal(e.end)}`,
      `SUMMARY:${escapeText(e.summary)}`,
    );
    if (e.location) L.push(`LOCATION:${escapeText(e.location)}`);
    if (e.description) L.push(`DESCRIPTION:${escapeText(e.description)}`);
    L.push(`STATUS:${e.status ?? "CONFIRMED"}`, `SEQUENCE:${e.sequence ?? 0}`);
    if (e.lastModified) L.push(`LAST-MODIFIED:${utcStamp(e.lastModified)}`);
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(foldLine).join("\r\n") + "\r\n";
}
