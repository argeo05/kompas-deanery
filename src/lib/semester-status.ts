import { RISK_NEEDED_SHARE } from "../../config/grading";
import type { SemesterStatus, SemesterStatusReason, UUID } from "@/contracts/api";
import { neededFor } from "./grading";
import type { Item } from "./grading";

// DS-04. Статус семестра (таблица «Статус семестра», SPEC §6.4). Тесты: tests/unit/semester-status.test.ts.
//
// По каждой дисциплине:
// - admitted === false → NOT_ADMITTED; hasDebt → DEBT. Любая даёт «action»;
// - missedDeadlines > 0 → MISSED_DEADLINE;
// - NEED_OVER_70: для passThreshold нужно строго больше RISK_NEEDED_SHARE от оставшегося
//   максимума (needed > 0,7 · maxPossible по neededFor); несданного не осталось, а порог
//   не набран — тоже NEED_OVER_70;
// - admitted === null — не причина.
// Статус семестра — худший: action > risk > ok; reasons — все причины всех дисциплин.

export type { SemesterStatus };

export interface CourseStanding {
  courseId: UUID;
  items: Item[];
  /** Итог S для удовлетворительной оценки или «зачтено». */
  passThreshold: number;
  /** null — допуск ещё не решён. */
  admitted: boolean | null;
  hasDebt: boolean;
  missedDeadlines: number;
}

const RANK: Record<SemesterStatus, number> = { action: 2, risk: 1, ok: 0 };

export function semesterStatus(courses: CourseStanding[]): {
  status: SemesterStatus;
  reasons: Array<{ courseId: UUID; reason: SemesterStatusReason }>;
} {
  const reasons: Array<{ courseId: UUID; reason: SemesterStatusReason }> = [];
  let worst: SemesterStatus = "ok";

  for (const c of courses) {
    const add = (reason: SemesterStatusReason, status: SemesterStatus) => {
      reasons.push({ courseId: c.courseId, reason });
      if (RANK[status] > RANK[worst]) worst = status;
    };

    if (c.admitted === false) add("NOT_ADMITTED", "action");
    if (c.hasDebt) add("DEBT", "action");
    if (c.missedDeadlines > 0) add("MISSED_DEADLINE", "risk");

    const { needed, maxPossible } = neededFor(c.items, c.passThreshold);
    if (needed > maxPossible * RISK_NEEDED_SHARE) add("NEED_OVER_70", "risk");
  }

  return { status: worst, reasons };
}
