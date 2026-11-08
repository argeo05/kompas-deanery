import "server-only";
import { and, asc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import {
  classNotes,
  courses,
  enrollments,
  rooms,
  scheduleChangeViews,
  scheduleChanges,
  teachers,
} from "../../../db/schema";
import { classes } from "../../../db/schema/study";
import type { Tx } from "../db";

// Репозиторий расписания студента (DS-11). Все запросы внутри withUserTx и с условием по владельцу.
// Пары: группа студента + курсы его enrollments (потоковые пары идут без группы — SPEC §6.3 п.8).

export interface MyScheduleKeys {
  studentId: string;
  groupId: string;
}

/** Записи студента: к каким курсам он прикреплён (для потоковых пар без группы). */
export async function listMyCourseIds(tx: Tx, keys: MyScheduleKeys): Promise<string[]> {
  const rows = await tx
    .select({ id: enrollments.courseId })
    .from(enrollments)
    .where(eq(enrollments.studentId, keys.studentId));
  return rows.map((r) => r.id);
}

const MINE_OR_ENROLLED = (keys: MyScheduleKeys) => (courseIds: string[]) =>
  courseIds.length === 0
    ? eq(classes.groupId, keys.groupId)
    : or(
        eq(classes.groupId, keys.groupId),
        and(inArray(classes.courseId, courseIds), sql`${classes.groupId} IS NULL`),
      );

/** Пары за диапазон [start, end): группы и потоковые личные, отсортированы по началу. */
export async function listMyClasses(
  tx: Tx,
  keys: MyScheduleKeys,
  courseIds: string[],
  start: Date,
  end: Date,
) {
  return tx
    .select({ row: classes, course: courses, room: rooms, teacher: teachers })
    .from(classes)
    .innerJoin(courses, eq(courses.id, classes.courseId))
    .innerJoin(rooms, eq(rooms.id, classes.roomId))
    .innerJoin(teachers, eq(teachers.id, classes.teacherId))
    .where(
      and(
        MINE_OR_ENROLLED(keys)(courseIds),
        gte(classes.startsAt, start),
        lt(classes.startsAt, end),
      ),
    )
    .orderBy(asc(classes.startsAt), asc(classes.id));
}

/** Изменения расписания для перечисленных пар. */
export async function listChangesForClasses(tx: Tx, classIds: string[]) {
  if (classIds.length === 0) return [];
  return tx
    .select({
      change: scheduleChanges,
      newRoom: rooms,
      newTeacher: teachers,
      classId: classes.id,
    })
    .from(scheduleChanges)
    .innerJoin(classes, eq(classes.id, scheduleChanges.classId))
    .leftJoin(rooms, eq(rooms.id, scheduleChanges.newRoomId))
    .leftJoin(teachers, eq(teachers.id, scheduleChanges.newTeacherId))
    .where(inArray(scheduleChanges.classId, classIds))
    .orderBy(asc(scheduleChanges.createdAt), asc(scheduleChanges.id));
}

/** Какие изменения студент уже видел. */
export async function listSeenChangeIds(
  tx: Tx,
  studentId: string,
  changeIds: string[],
): Promise<Set<string>> {
  if (changeIds.length === 0) return new Set();
  const rows = await tx
    .select({ changeId: scheduleChangeViews.changeId })
    .from(scheduleChangeViews)
    .where(
      and(
        eq(scheduleChangeViews.studentId, studentId),
        inArray(scheduleChangeViews.changeId, changeIds),
      ),
    );
  return new Set(rows.map((r) => r.changeId));
}

/** Личные заметки студента к парам. */
export async function listMyClassNotes(tx: Tx, studentId: string): Promise<Map<string, string>> {
  const rows = await tx
    .select({ classId: classNotes.classId, text: classNotes.text })
    .from(classNotes)
    .where(eq(classNotes.studentId, studentId));
  return new Map(rows.map((r) => [r.classId, r.text]));
}

/** Заметка к паре: null — заметки нет. */
export async function findMyClassNote(
  tx: Tx,
  studentId: string,
  classId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ text: classNotes.text })
    .from(classNotes)
    .where(and(eq(classNotes.studentId, studentId), eq(classNotes.classId, classId)))
    .limit(1);
  return row?.text ?? null;
}

/** Принадлежит ли пара расписанию студента (группа или личный курс). */
export async function isMyClass(
  tx: Tx,
  keys: MyScheduleKeys,
  courseIds: string[],
  classId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.id, classId), MINE_OR_ENROLLED(keys)(courseIds)))
    .limit(1);
  return row !== undefined;
}

/** Пометить изменения просмотренными; чужие id (не студентские пары) отбрасываются. */
export async function markChangesSeen(
  tx: Tx,
  keys: MyScheduleKeys,
  changeIds: string[],
): Promise<void> {
  const rows = await tx
    .select({ id: scheduleChanges.id })
    .from(scheduleChanges)
    .innerJoin(classes, eq(classes.id, scheduleChanges.classId))
    .where(
      and(
        inArray(scheduleChanges.id, changeIds),
        or(
          eq(classes.groupId, keys.groupId),
          and(
            sql`${classes.groupId} IS NULL`,
            inArray(
              classes.courseId,
              tx
                .select({ id: enrollments.courseId })
                .from(enrollments)
                .where(eq(enrollments.studentId, keys.studentId)),
            ),
          ),
        ),
      ),
    );
  if (rows.length === 0) return;
  await tx
    .insert(scheduleChangeViews)
    .values(rows.map((r) => ({ studentId: keys.studentId, changeId: r.id })))
    .onConflictDoNothing();
}
