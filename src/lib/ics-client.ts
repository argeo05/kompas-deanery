import type { ClassDTO } from "@/contracts/api";

// Одно событие → файл .ics для календаря телефона (SPEC §6.3 п.6). Это не подписка (/api/ics/…):
// файл собирается в браузере из уже показанных данных, на сервер ничего не уходит.

export interface IcsEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  description?: string;
}

const escapeText = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utc = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

export function eventToIcs(e: IcsEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Компас//концепт//RU",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${e.id}@kompas.concept`,
    `DTSTAMP:${utc(new Date().toISOString())}`,
    `DTSTART:${utc(e.startsAt)}`,
    `DTEND:${utc(e.endsAt)}`,
    `SUMMARY:${escapeText(e.title)}`,
    ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

/** Скачивает .ics через временную ссылку. */
export function downloadIcs(e: IcsEvent): void {
  const blob = new Blob([eventToIcs(e)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "kompas.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadClassIcs(c: ClassDTO): void {
  downloadIcs({
    id: c.id,
    title: c.course.title,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    location: `ауд. ${c.room.number}, корп. ${c.room.building}`,
    description: c.teacher.fullName,
  });
}
