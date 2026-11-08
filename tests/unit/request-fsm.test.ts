import { describe, expect, it } from "vitest";
import type { RequestAction, RequestStatus } from "@/contracts/api";
import { canTransition, InvalidTransitionError, nextStatus } from "@/lib/request-fsm";

// DS-06 · Конечный автомат заявки (схема статусов SPEC §6.5, AC-5.2). Тесты готовы, их не менять.
// Разрешены ровно переходы из таблицы ниже; всё остальное — запрет (в API это 409 CONFLICT).

const STATUSES: RequestStatus[] = [
  "submitted",
  "in_progress",
  "needs_info",
  "ready",
  "issued",
  "rejected",
  "cancelled",
];
const ACTIONS: RequestAction[] = [
  "take",
  "need_info",
  "student_reply",
  "ready",
  "issue",
  "reject",
  "cancel",
];
const ACTORS = ["student", "staff"] as const;

const ALLOWED: Array<[RequestStatus, RequestAction, (typeof ACTORS)[number], RequestStatus]> = [
  ["submitted", "take", "staff", "in_progress"],
  ["submitted", "reject", "staff", "rejected"],
  ["submitted", "cancel", "student", "cancelled"],
  ["in_progress", "need_info", "staff", "needs_info"],
  ["in_progress", "ready", "staff", "ready"],
  ["in_progress", "reject", "staff", "rejected"],
  ["needs_info", "student_reply", "student", "in_progress"],
  ["ready", "issue", "staff", "issued"],
];

const allowed = (from: RequestStatus, action: RequestAction, actor?: string) =>
  ALLOWED.find(([f, a, who]) => f === from && a === action && (!actor || who === actor));

const matrix = STATUSES.flatMap((from) =>
  ACTIONS.flatMap((action) => ACTORS.map((actor) => [from, action, actor] as const)),
);

describe("canTransition: полная матрица 7 статусов × 7 действий × 2 участника", () => {
  it.each(matrix)("%s —%s→ (%s)", (from, action, actor) => {
    expect(canTransition(from, action, actor)).toBe(Boolean(allowed(from, action, actor)));
  });
});

describe("nextStatus", () => {
  it.each(ALLOWED)("%s —%s→ (%s) = %s", (from, action, _actor, to) => {
    expect(nextStatus(from, action)).toBe(to);
  });

  const forbidden = STATUSES.flatMap((from) =>
    ACTIONS.filter((action) => !allowed(from, action)).map((action) => [from, action] as const),
  );
  it.each(forbidden)("%s —%s→ запрещён: InvalidTransitionError", (from, action) => {
    expect(() => nextStatus(from, action)).toThrow(InvalidTransitionError);
  });
});

describe("правила участников (SPEC §6.5, DEEPSEEK-TASKS DS-06)", () => {
  it("отменить может только студент и только пока заявку не взяли в работу", () => {
    expect(canTransition("submitted", "cancel", "student")).toBe(true);
    expect(canTransition("submitted", "cancel", "staff")).toBe(false);
    expect(canTransition("in_progress", "cancel", "student")).toBe(false);
  });

  it("ответить на уточнение может только студент и только из needs_info", () => {
    expect(canTransition("needs_info", "student_reply", "student")).toBe(true);
    expect(canTransition("needs_info", "student_reply", "staff")).toBe(false);
    expect(canTransition("in_progress", "student_reply", "student")).toBe(false);
  });

  it("студент не выполняет действия сотрудника", () => {
    for (const action of ["take", "need_info", "ready", "issue", "reject"] as const) {
      for (const from of STATUSES) expect(canTransition(from, action, "student")).toBe(false);
    }
  });

  it("из конечных статусов переходов нет", () => {
    for (const from of ["issued", "rejected", "cancelled"] as const) {
      for (const action of ACTIONS) {
        for (const actor of ACTORS) expect(canTransition(from, action, actor)).toBe(false);
      }
    }
  });
});
