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
