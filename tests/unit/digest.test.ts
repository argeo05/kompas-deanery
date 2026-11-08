import { describe, expect, it } from "vitest";
import { deliveryTime, digestSlot } from "@/lib/digest";

// DS-02 · Слот дайджеста и момент доставки (SPEC §6.6, AC-6.3). Тесты готовы, их не менять.
//
// Правила (решение D-003):
// - время — московское; слоты и тихие часы — минуты от полуночи МСК;
// - slot(t) = min{ dⱼ : dⱼ ≥ t } с учётом секунд: 13:00:00 → 13:00, 13:00:30 → 19:00;
//   нет такого слота — первый слот следующего календарного дня (праздники не важны);
// - тихие часы [from, to): при from > to интервал идёт через полночь (23:00–07:00);
//   07:00 уже не тихое время, 23:00 — тихое. Слот внутри тихих часов пропускается;
// - urgent и категории из immediateCategories доставляются сразу, а в тихие часы —
//   в момент их окончания (07:00);
// - ответ — ISODateTime +03:00, у слота секунды :00.

const SLOTS = [480, 780, 1140]; // 08:00, 13:00, 19:00 — по умолчанию
const EVENING = [720, 1050, 1290]; // 12:00, 17:30, 21:30 — пресет «Вечерний»
const QUIET = { from: 1380, to: 420 }; // 23:00–07:00
const PREFS = { slots: SLOTS, quietFrom: 1380, quietTo: 420, immediateCategories: [] as string[] };

const msk = (date: string, time: string) => `${date}T${time}+03:00`;

describe("digestSlot", () => {
  it("AC-6.3: личное в 10:15 попадает в дайджест 13:00", () => {
    expect(digestSlot(msk("2026-11-12", "10:15:00"), SLOTS, QUIET)).toBe(
      msk("2026-11-12", "13:00:00"),
    );
  });

  it.each([
    ["12:59:00", "13:00:00"],
    ["12:59:59", "13:00:00"],
    ["13:00:00", "13:00:00"],
    ["13:00:30", "19:00:00"],
    ["13:01:00", "19:00:00"],
  ])("граница слота 13:00: %s → %s", (time, slot) => {
    expect(digestSlot(msk("2026-11-12", time), SLOTS, QUIET)).toBe(msk("2026-11-12", slot));
  });

  it("после последнего слота — первый слот следующего дня (переход через полночь)", () => {
    expect(digestSlot(msk("2026-11-12", "19:01:00"), SLOTS, QUIET)).toBe(
      msk("2026-11-13", "08:00:00"),
    );
    expect(digestSlot(msk("2026-11-12", "23:59:00"), SLOTS, QUIET)).toBe(
      msk("2026-11-13", "08:00:00"),
    );
  });

  it("сразу после полуночи — первый слот того же дня", () => {
    expect(digestSlot(msk("2026-11-13", "00:00:00"), SLOTS, QUIET)).toBe(
      msk("2026-11-13", "08:00:00"),
    );
  });

  it("переход через конец месяца и года", () => {
    expect(digestSlot(msk("2026-11-30", "20:00:00"), SLOTS, QUIET)).toBe(
      msk("2026-12-01", "08:00:00"),
    );
    expect(digestSlot(msk("2026-12-31", "19:30:00"), SLOTS, QUIET)).toBe(
      msk("2027-01-01", "08:00:00"),
    );
  });

  it("пресет «Вечерний»", () => {
    expect(digestSlot(msk("2026-11-12", "17:30:00"), EVENING, QUIET)).toBe(
      msk("2026-11-12", "17:30:00"),
    );
    expect(digestSlot(msk("2026-11-12", "21:31:00"), EVENING, QUIET)).toBe(
      msk("2026-11-13", "12:00:00"),
    );
  });

  it("слот внутри тихих часов пропускается", () => {
    // 23:30 попадает в 23:00–07:00 → следующий слот 08:00 завтра.
    expect(digestSlot(msk("2026-11-12", "20:00:00"), [480, 1410], QUIET)).toBe(
      msk("2026-11-13", "08:00:00"),
    );
  });

  it("вход в UTC переводится в Москву", () => {
    // 07:15Z = 10:15 МСК
    expect(digestSlot("2026-11-12T07:15:00Z", SLOTS, QUIET)).toBe(msk("2026-11-12", "13:00:00"));
    // 21:30Z = 00:30 МСК следующего дня
    expect(digestSlot("2026-11-12T21:30:00Z", SLOTS, QUIET)).toBe(msk("2026-11-13", "08:00:00"));
  });
});

describe("deliveryTime", () => {
  it("срочное — сразу", () => {
    expect(deliveryTime("urgent", msk("2026-11-12", "10:15:00"), PREFS, "schedule")).toBe(
      msk("2026-11-12", "10:15:00"),
    );
    expect(deliveryTime("urgent", msk("2026-11-12", "22:59:00"), PREFS, "schedule")).toBe(
      msk("2026-11-12", "22:59:00"),
    );
  });

  it("срочное в тихие часы — в момент их окончания", () => {
    expect(deliveryTime("urgent", msk("2026-11-12", "23:00:00"), PREFS, "schedule")).toBe(
      msk("2026-11-13", "07:00:00"),
    );
    expect(deliveryTime("urgent", msk("2026-11-12", "23:30:00"), PREFS, "schedule")).toBe(
      msk("2026-11-13", "07:00:00"),
    );
    expect(deliveryTime("urgent", msk("2026-11-13", "02:00:00"), PREFS, "schedule")).toBe(
      msk("2026-11-13", "07:00:00"),
    );
    expect(deliveryTime("urgent", msk("2026-11-13", "07:00:00"), PREFS, "schedule")).toBe(
      msk("2026-11-13", "07:00:00"),
    );
  });

  it("тихие часы берутся из настроек студента", () => {
    const prefs = { ...PREFS, quietFrom: 1320, quietTo: 480 }; // 22:00–08:00
    expect(deliveryTime("urgent", msk("2026-11-12", "22:30:00"), prefs, "request")).toBe(
      msk("2026-11-13", "08:00:00"),
    );
  });

  it("личное и информационное — в слот дайджеста", () => {
    expect(deliveryTime("personal", msk("2026-11-12", "10:15:00"), PREFS, "grade")).toBe(
      msk("2026-11-12", "13:00:00"),
    );
    expect(deliveryTime("info", msk("2026-11-12", "19:01:00"), PREFS, "announcement")).toBe(
      msk("2026-11-13", "08:00:00"),
    );
    expect(
      deliveryTime(
        "personal",
        msk("2026-11-12", "21:31:00"),
        { ...PREFS, slots: EVENING },
        "grade",
      ),
    ).toBe(msk("2026-11-13", "12:00:00"));
  });

  it("категория из immediateCategories доставляется сразу, остальные — по слоту (личный контроль v1.1)", () => {
    const prefs = { ...PREFS, immediateCategories: ["grade"] };
    expect(deliveryTime("personal", msk("2026-11-12", "10:15:00"), prefs, "grade")).toBe(
      msk("2026-11-12", "10:15:00"),
    );
    expect(deliveryTime("personal", msk("2026-11-12", "10:15:00"), prefs, "request")).toBe(
      msk("2026-11-12", "13:00:00"),
    );
    expect(deliveryTime("personal", msk("2026-11-12", "23:30:00"), prefs, "grade")).toBe(
      msk("2026-11-13", "07:00:00"),
    );
  });

  it("ответ всегда в московском формате", () => {
    expect(deliveryTime("urgent", "2026-11-12T07:15:00Z", PREFS, "schedule")).toBe(
      msk("2026-11-12", "10:15:00"),
    );
  });
});
