import type { SemesterStatus, SemesterStatusReason, UUID } from "@/contracts/api";
import type { Item } from "./grading";
import { notImplemented } from "./not-implemented";

// DS-04. Статус семестра (таблица «Статус семестра», SPEC §6.4). Тесты: tests/unit/semester-status.test.ts.

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

export function semesterStatus(courses: CourseStanding[]): {
  status: SemesterStatus;
  reasons: Array<{ courseId: UUID; reason: SemesterStatusReason }>;
} {
  return notImplemented("DS-04", courses);
}
