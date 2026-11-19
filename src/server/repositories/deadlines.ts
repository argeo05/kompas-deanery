import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { courses, deadlines, plans } from "../../../db/schema";
import type { Tx } from "../db";

// Репозиторий дедлайнов и планов (DS-15). Все запросы внутри withUserTx и с условием
// по владельцу: eq(deadlines.studentId, studentId) / eq(plans.studentId, studentId).
// Функций «по id без владельца» здесь нет и быть не должно.

/** Дедлайны студента с названием дисциплины (null для личных и админских). */
export function listDeadlinesForStudent(tx: Tx, studentId: string) {
  return tx
    .select({ deadline: deadlines, courseTitle: courses.title })
    .from(deadlines)
    .leftJoin(courses, eq(courses.id, deadlines.courseId))
    .where(eq(deadlines.studentId, studentId))
    .orderBy(asc(deadlines.dueAt), asc(deadlines.id));
}

/** Планы студента; новые первыми — первый попавшийся и есть «текущий» план дедлайна. */
export function listPlansForStudent(tx: Tx, studentId: string) {
  return tx
    .select()
    .from(plans)
    .where(eq(plans.studentId, studentId))
    .orderBy(desc(plans.createdAt), desc(plans.id));
}

/** Дедлайн студента; null — нет такого у этого студента. */
export async function findDeadlineForStudent(
  tx: Tx,
  studentId: string,
  deadlineId: string,
  lock = false,
): Promise<{ deadline: typeof deadlines.$inferSelect; courseTitle: string | null } | null> {
  const query = tx
    .select({ deadline: deadlines, courseTitle: courses.title })
    .from(deadlines)
    .leftJoin(courses, eq(courses.id, deadlines.courseId))
    .where(and(eq(deadlines.id, deadlineId), eq(deadlines.studentId, studentId)))
    .limit(1);
  const [row] = await (lock ? query.for("update", { of: deadlines }) : query);
  return row ?? null;
}

/** План студента; null — нет такого у этого студента. */
export async function findPlanForStudent(
  tx: Tx,
  studentId: string,
  planId: string,
): Promise<typeof plans.$inferSelect | null> {
  const [row] = await tx
    .select()
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.studentId, studentId)))
    .limit(1);
  return row ?? null;
}

export async function findLatestPlanForDeadline(tx: Tx, studentId: string, deadlineId: string) {
  const [plan] = await tx
    .select()
    .from(plans)
    .where(and(eq(plans.studentId, studentId), eq(plans.deadlineId, deadlineId)))
    .orderBy(desc(plans.createdAt), desc(plans.id))
    .limit(1);
  return plan;
}
