import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { admissions, courses, exams, rooms } from "../../../db/schema";
import type { Tx } from "../db";

// Репозиторий сессии (DS-14). exams — общие таблицы (по группе), admissions —
// личная таблица: соединяется только с условием по владельцу и вызывается внутри withUserTx.

/** Экзамены и зачёты группы студента с допуском конкретного студента, по времени. */
export function listExamsForStudentGroup(tx: Tx, groupId: string, studentId: string) {
  return tx
    .select({
      exam: exams,
      courseTitle: courses.title,
      room: { building: rooms.building, number: rooms.number },
      admission: { admitted: admissions.admitted, reason: admissions.reason },
    })
    .from(exams)
    .innerJoin(courses, eq(courses.id, exams.courseId))
    .innerJoin(rooms, eq(rooms.id, exams.roomId))
    .leftJoin(admissions, and(eq(admissions.examId, exams.id), eq(admissions.studentId, studentId)))
    .where(eq(exams.groupId, groupId))
    .orderBy(asc(exams.startsAt), asc(exams.id));
}
