import { afterEach, describe, expect, it } from "vitest";
import { now } from "@/lib/clock";
import { formatRequestNumber } from "@/lib/request-number";
import {
  addDaysMsk,
  mskDateTime,
  mskParts,
  nowMsk,
  startOfDayMsk,
  toMsk,
  toMskDate,
} from "@/lib/time";
import { freezeTime, unfreezeTime } from "../helpers/clock";

afterEach(unfreezeTime);

describe("time: Europe/Moscow", () => {
  it("toMsk отдаёт ISO с явным смещением +03:00", () => {
    expect(toMsk("2026-11-12T06:30:00Z")).toBe("2026-11-12T09:30:00+03:00");
  });

  it("toMskDate: 22:30 UTC — это уже следующий день в Москве", () => {
    expect(toMskDate("2026-11-12T22:30:00Z")).toBe("2026-11-13");
  });

  it("startOfDayMsk — московская полночь, а не UTC", () => {
    expect(startOfDayMsk(new Date("2026-11-12T22:30:00Z")).toISOString()).toBe(
      "2026-11-12T21:00:00.000Z",
    );
    expect(startOfDayMsk("2026-11-12").toISOString()).toBe("2026-11-11T21:00:00.000Z");
  });

  it("mskDateTime и addDaysMsk через смену месяца и года", () => {
    expect(toMsk(mskDateTime("2026-12-31", "18:00"))).toBe("2026-12-31T18:00:00+03:00");
    expect(toMsk(addDaysMsk(mskDateTime("2026-12-31", "18:00"), 1))).toBe(
      "2027-01-01T18:00:00+03:00",
    );
    expect(toMsk(addDaysMsk(mskDateTime("2026-03-01", "00:30"), -1))).toBe(
      "2026-02-28T00:30:00+03:00",
    );
  });

  it("день недели ISO: 12.11.2026 — четверг", () => {
    expect(mskParts("2026-11-12T09:00:00+03:00").weekday).toBe(4);
    expect(mskParts("2026-11-15T23:59:00+03:00").weekday).toBe(7);
  });

  it("freezeTime подменяет now() и nowMsk()", () => {
    freezeTime("2026-11-12T09:30:00+03:00");
    expect(now().toISOString()).toBe("2026-11-12T06:30:00.000Z");
    expect(nowMsk()).toBe("2026-11-12T09:30:00+03:00");
    unfreezeTime();
    expect(Math.abs(now().getTime() - Date.now())).toBeLessThan(1000);
  });

  it("некорректная дата — исключение, а не Invalid Date", () => {
    expect(() => toMsk("not-a-date")).toThrow(RangeError);
  });
});

describe("номер заявки", () => {
  it("формат СП-ГГММ-NNNN по московской дате подачи", () => {
    expect(formatRequestNumber(new Date("2026-11-30T21:30:00Z"), 42)).toBe("СП-2612-0042");
  });
});
