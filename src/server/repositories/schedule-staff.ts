import "server-only";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { courses, groups, programs, rooms, teachers } from "../../../db/schema";
import { classes } from "../../../db/schema/study";
import type { Tx } from "../db";

// Репозиторий расписания сотрудника (DS-32). Таблица classes не личная и без RLS: видимость
// пар для сотрудника определяется здесь — join classes → groups → programs.faculty_id
// (РЕШЕНИЕ DS-32). Потоковые пары (group_id IS NULL) проходят join с NULL program и потому
// видны только общевузовскому подразделению (facultyId null — студенческий офис).

export interface StaffClassRow {
  row: typeof classes.$inferSelect;
  course: typeof courses.$inferSelect;
  room: typeof rooms.$inferSelect;
  teacher: typeof teachers.$inferSelect;
  group: { id: string; title: string } | null;
}

const CLASS_SELECT = {
  row: classes,
  course: courses,
  room: rooms,
  teacher: teachers,
  group: { id: groups.id, title: groups.title },
};

const baseQuery = (tx: Tx) =>
  tx
    .select(CLASS_SELECT)
    .from(classes)
    .innerJoin(courses, eq(courses.id, classes.courseId))
    .innerJoin(rooms, eq(rooms.id, classes.roomId))
    .innerJoin(teachers, eq(teachers.id, classes.teacherId))
    .leftJoin(groups, eq(groups.id, classes.groupId))
    .leftJoin(programs, eq(programs.id, groups.programId));

const facultyScope = (scope: { facultyId: string | null }) =>
  scope.facultyId ? eq(programs.facultyId, scope.facultyId) : undefined;

/** Пары диапазона [start, end) в области видимости сотрудника, опционально одной группы. */
export function listStaffClasses(
  tx: Tx,
  scope: { facultyId: string | null },
  range: { start: Date; end: Date; groupId?: string },
) {
  return baseQuery(tx)
    .where(
      and(
        facultyScope(scope),
        gte(classes.startsAt, range.start),
        lt(classes.startsAt, range.end),
        range.groupId ? eq(classes.groupId, range.groupId) : undefined,
      ),
    )
    .orderBy(asc(classes.startsAt), asc(classes.id));
}

/**
 * Пара в области видимости сотрудника (для изменения). null — чужой факультет,
 * несуществующий id или потоковая пара чужого факультета: обработчик отвечает 404.
 */
export async function findClassForStaff(
  tx: Tx,
  scope: { facultyId: string | null },
  classId: string,
): Promise<StaffClassRow | null> {
  const [row] = await baseQuery(tx)
    .where(and(eq(classes.id, classId), facultyScope(scope)))
    .limit(1);
  return row ?? null;
}
