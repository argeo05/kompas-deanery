import { describe, expect, it } from "vitest";
import { semesterStatus, type CourseStanding } from "@/lib/semester-status";

// DS-04 · Статус семестра (таблица «Статус семестра», SPEC §6.4). Тесты готовы, их не менять.
//
// Правила (решение D-003), по каждой дисциплине:
// - admitted === false → NOT_ADMITTED; hasDebt → DEBT. Любая из них даёт статус «action»;
// - missedDeadlines > 0 → MISSED_DEADLINE;
// - NEED_OVER_70: для passThreshold нужно набрать строго больше RISK_NEEDED_SHARE (70 %)
//   от оставшегося максимума: needed > 0,7 · maxPossible (needed, maxPossible — из neededFor).
//   Если несданного не осталось, а порог не набран, это тоже NEED_OVER_70;
//   MISSED_DEADLINE и NEED_OVER_70 дают «risk»;
// - admitted === null (допуск ещё не решён) — не причина;
// - статус семестра — худший: action > risk > ok; reasons — все найденные причины всех дисциплин.

const course = (courseId: string, patch: Partial<CourseStanding> = {}): CourseStanding => ({
  courseId,
  // Сдано 38,5 из 50, осталось 50: для 55 нужно 16,5 — 33 % от остатка.
  items: [
    { score: 8, max: 10, weight: 0.2 },
    { score: 15, max: 20, weight: 0.3 },
    { score: null, max: 100, weight: 0.5 },
  ],
  passThreshold: 55,
  admitted: null,
  hasDebt: false,
  missedDeadlines: 0,
  ...patch,
});

describe("semesterStatus", () => {
  it("нет дисциплин — всё в порядке", () => {
    expect(semesterStatus([])).toEqual({ status: "ok", reasons: [] });
  });

  it("всё достижимо, допуск ещё не решён — всё в порядке", () => {
    expect(semesterStatus([course("c1"), course("c2", { admitted: true })])).toEqual({
      status: "ok",
      reasons: [],
    });
  });

  it("нужно больше 70 % оставшегося — риск", () => {
    // Сдано 5, осталось 50: нужно 50 > 35.
    const c = course("c1", {
      items: [
        { score: 1, max: 10, weight: 0.5 },
        { score: null, max: 100, weight: 0.5 },
      ],
    });
    expect(semesterStatus([c])).toEqual({
      status: "risk",
      reasons: [{ courseId: "c1", reason: "NEED_OVER_70" }],
    });
  });

  it("граница: нужно ровно 70 % — ещё не риск, чуть больше — риск", () => {
    const exactly = course("c1", {
      items: [
        { score: 4, max: 10, weight: 0.5 }, // 20 → нужно 35 из 50
        { score: null, max: 100, weight: 0.5 },
      ],
    });
    expect(semesterStatus([exactly]).status).toBe("ok");
    const over = course("c1", {
      items: [
        { score: 39, max: 100, weight: 0.5 }, // 19,5 → нужно 35,5 из 50
        { score: null, max: 100, weight: 0.5 },
      ],
    });
    expect(semesterStatus([over]).reasons).toEqual([{ courseId: "c1", reason: "NEED_OVER_70" }]);
  });

  it("порог берётся из passThreshold дисциплины", () => {
    const items = [
      { score: 1, max: 10, weight: 0.5 }, // 5, осталось 50
      { score: null, max: 100, weight: 0.5 },
    ];
    expect(semesterStatus([course("c1", { items, passThreshold: 40 })]).status).toBe("ok");
    expect(semesterStatus([course("c1", { items, passThreshold: 55 })]).status).toBe("risk");
  });

  it("всё сдано, порог не набран, несданного не осталось — риск", () => {
    const c = course("c1", { items: [{ score: 40, max: 100, weight: 1 }] });
    expect(semesterStatus([c]).reasons).toEqual([{ courseId: "c1", reason: "NEED_OVER_70" }]);
  });

  it("пропущенный дедлайн — риск", () => {
    expect(semesterStatus([course("c1", { missedDeadlines: 1 })])).toEqual({
      status: "risk",
      reasons: [{ courseId: "c1", reason: "MISSED_DEADLINE" }],
    });
  });

  it("недопуск — нужно действовать", () => {
    expect(semesterStatus([course("c1", { admitted: false })])).toEqual({
      status: "action",
      reasons: [{ courseId: "c1", reason: "NOT_ADMITTED" }],
    });
  });

  it("академическая задолженность — нужно действовать", () => {
    expect(semesterStatus([course("c1", { hasDebt: true })])).toEqual({
      status: "action",
      reasons: [{ courseId: "c1", reason: "DEBT" }],
    });
  });

  it("худший статус побеждает, причины перечислены по всем дисциплинам", () => {
    const result = semesterStatus([
      course("c1", { missedDeadlines: 2 }),
      course("c2"),
      course("c3", { hasDebt: true }),
    ]);
    expect(result.status).toBe("action");
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        { courseId: "c1", reason: "MISSED_DEADLINE" },
        { courseId: "c3", reason: "DEBT" },
      ]),
    );
  });

  it("у одной дисциплины может быть несколько причин", () => {
    const result = semesterStatus([course("c1", { admitted: false, missedDeadlines: 1 })]);
    expect(result.status).toBe("action");
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        { courseId: "c1", reason: "NOT_ADMITTED" },
        { courseId: "c1", reason: "MISSED_DEADLINE" },
      ]),
    );
  });
});
