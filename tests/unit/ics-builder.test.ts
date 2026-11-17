import { describe, expect, it } from "vitest";
import ICAL from "ical.js";
import { buildCalendar, escapeText, foldLine, mskLocal } from "@/lib/ics";

// RFC 5545: VTIMEZONE Europe/Moscow, время с TZID, стабильные UID, свёртка строк, экранирование.

const stamp = new Date("2026-11-12T09:00:00Z");
const cal = buildCalendar({
  name: "Компас",
  stamp,
  events: [
    {
      uid: "class-1@kompas",
      start: new Date("2026-11-12T09:40:00Z"),
      end: new Date("2026-11-12T11:10:00Z"),
      summary: "Макро; семинар, 2 пара",
      location: "Корпус А 4012",
      description: "Иванов И. И.",
      sequence: 2,
    },
    {
      uid: "class-2@kompas",
      start: new Date("2026-11-13T09:40:00Z"),
      end: new Date("2026-11-13T11:10:00Z"),
      summary: "Отменена",
      status: "CANCELLED",
    },
  ],
});

describe("ICS", () => {
  it("парсится ical.js: VTIMEZONE Europe/Moscow и два события", () => {
    const root = new ICAL.Component(ICAL.parse(cal));
    expect(root.getFirstPropertyValue("version")).toBe("2.0");
    expect(root.getFirstSubcomponent("vtimezone")?.getFirstPropertyValue("tzid")).toBe(
      "Europe/Moscow",
    );
    expect(root.getAllSubcomponents("vevent")).toHaveLength(2);
  });

  it("время записано с TZID в Москве, а не плавающим и не UTC", () => {
    expect(cal).toContain("DTSTART;TZID=Europe/Moscow:20261112T124000");
    expect(mskLocal(new Date("2026-12-31T21:30:00Z"))).toBe("20270101T003000");
  });

  it("UID стабильные, у отменённой STATUS:CANCELLED, у правленой растёт SEQUENCE", () => {
    expect(cal).toContain("UID:class-1@kompas");
    expect(cal).toContain("STATUS:CANCELLED");
    expect(cal).toContain("SEQUENCE:2");
    expect(buildCalendar({ name: "x", stamp, events: [] })).not.toContain("BEGIN:VEVENT");
  });

  it("разделитель строк CRLF, длинные строки свёрнуты до 75 октетов", () => {
    expect(cal.endsWith("\r\n")).toBe(true);
    for (const line of cal.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const folded = foldLine("SUMMARY:" + "ж".repeat(80));
    expect(folded).toContain("\r\n ");
    expect(folded.replace(/\r\n /g, "")).toBe("SUMMARY:" + "ж".repeat(80));
  });

  it("экранирует ; , \\ и переводы строк", () => {
    expect(escapeText("а;б,в\\г\nд")).toBe("а\;б\\,в\\\\г\\nд");
    expect(cal).toContain("SUMMARY:Макро\; семинар\\, 2 пара");
  });
});
