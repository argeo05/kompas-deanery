import "server-only";
import { and, asc, desc, eq, gt, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  announcements,
  faculties,
  groups,
  programs,
  staffProfiles,
  studentProfiles,
  units,
} from "../../../db/schema";
import type { Tx } from "../db";

// Репозиторий объявлений (DS-31). Таблица announcements НЕ личная: роль приложения читает все
// строки (policy announcements_select USING true в 0001_rls.sql), вставляет и обновляет только
// сотрудник (RLS); попадание студента в аудиторию фильтруется здесь — RLS про аудиторию не знает.

export type Announcement = typeof announcements.$inferSelect;

/** Автор строки — «Миронова Е.» собирает сервис (staffShortName). */
export type AnnouncementAuthor = {
  firstName: string | null;
  lastName: string | null;
};

export interface AnnouncementRow {
  a: Announcement;
  author: AnnouncementAuthor;
}

/** Курсор — «ISO-момент|id» последней строки страницы (как в списке заявок, малосемантичный). */
export interface AnnouncementCursor {
  at: Date;
  id: string;
}

const AUTHOR_SELECT = {
  firstName: staffProfiles.firstName,
  lastName: staffProfiles.lastName,
};

// ── Список сотрудника ────────────────────────────────────────────────────────

/** Все объявления подразделений факультета сотрудника (null — общевузовский, видит все), даже будущие и истёкшие. */
export function listAnnouncementsForStaff(
  tx: Tx,
  scope: { facultyId: string | null },
  cursor: AnnouncementCursor | null,
  limit: number,
) {
  return tx
    .select({ a: announcements, author: AUTHOR_SELECT })
    .from(announcements)
    .innerJoin(units, eq(units.id, announcements.authorUnitId))
    .innerJoin(staffProfiles, eq(staffProfiles.userId, announcements.createdBy))
    .where(
      and(
        scope.facultyId ? eq(units.facultyId, scope.facultyId) : undefined,
        cursor
          ? sql`(${announcements.createdAt}, ${announcements.id}) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(announcements.createdAt), desc(announcements.id))
    .limit(limit + 1);
}

/** Объявление в области видимости сотрудника (для архива); null — чужое или несуществующее. */
export async function findAnnouncementForStaff(
  tx: Tx,
  scope: { facultyId: string | null },
  id: string,
): Promise<AnnouncementRow | null> {
  const [row] = await tx
    .select({ a: announcements, author: AUTHOR_SELECT })
    .from(announcements)
    .innerJoin(units, eq(units.id, announcements.authorUnitId))
    .innerJoin(staffProfiles, eq(staffProfiles.userId, announcements.createdBy))
    .where(
      and(
        eq(announcements.id, id),
        scope.facultyId ? eq(units.facultyId, scope.facultyId) : undefined,
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Архив: expiresAt и archivedAt = момент архива — эффект «объявление скрыто прямо сейчас». */
export function archiveAnnouncementRow(tx: Tx, id: string, at: Date) {
  return tx
    .update(announcements)
    .set({ archivedAt: at, expiresAt: at })
    .where(eq(announcements.id, id))
    .returning();
}

export function insertAnnouncement(tx: Tx, values: typeof announcements.$inferInsert) {
  return tx.insert(announcements).values(values).returning();
}

// ── Список студента ─────────────────────────────────────────────────────────

/**
 * Вхождение студента в аудиторию объявления (DS-31): заданные критерии ПЕРЕСЕКАЮТСЯ
 * (факультет ∧ курс ∧ группа, иерархия SPEC §6.6 п.3), внутри критерия — любой из списка.
 * Отсутствующий ключ jsonb — «критерий не задан» (не сужает). Пустую аудиторию отсекает Zod.
 */
export function audienceMatchesStudent(student: {
  facultyId: string;
  groupId: string;
  course: number;
}): SQL {
  const aud = announcements.audience;
  const facultyOk = sql`(not (${aud} ? 'facultyIds') or (${aud} -> 'facultyIds') ? ${student.facultyId})`;
  const groupOk = sql`(not (${aud} ? 'groupIds') or (${aud} -> 'groupIds') ? ${student.groupId})`;
  const courseOk = sql`(not (${aud} ? 'courses') or (${aud} -> 'courses') @> ${JSON.stringify([student.course])}::jsonb)`;
  return sql`(${facultyOk} and ${groupOk} and ${courseOk})`;
}

/** Видимые студенту объявления: publishAt ≤ now < (expiresAt ?? ∞) и студент входит в аудиторию. */
export function listVisibleAnnouncementsForStudent(
  tx: Tx,
  student: { facultyId: string; groupId: string; course: number },
  cursor: AnnouncementCursor | null,
  limit: number,
  at: Date,
) {
  return tx
    .select()
    .from(announcements)
    .where(
      and(
        sql`${announcements.publishAt} <= ${at.toISOString()}::timestamptz`,
        or(
          isNull(announcements.expiresAt),
          gt(announcements.expiresAt, sql`${at.toISOString()}::timestamptz`),
        ),
        audienceMatchesStudent(student),
        cursor
          ? sql`(${announcements.publishAt}, ${announcements.id}) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(announcements.publishAt), desc(announcements.id))
    .limit(limit + 1);
}

// ── Каталоги и аудитория для notify ─────────────────────────────────────────

/** Существующие факультеты из списка (совпадение по id, уникальны). */
export function listExistingFacultyIds(tx: Tx, ids: string[]) {
  return tx
    .select({ id: faculties.id })
    .from(faculties)
    .where(inArray(faculties.id, ids))
    .orderBy(asc(faculties.id));
}

/** Группы с факультетом программы: проверка «группа чужого факультета». */
export function listGroupFaculties(tx: Tx, ids: string[]) {
  return tx
    .select({ id: groups.id, facultyId: programs.facultyId })
    .from(groups)
    .innerJoin(programs, eq(programs.id, groups.programId))
    .where(inArray(groups.id, ids));
}

/** Номер курса студента; null — профиля нет (не бывает у ctx из requireStudent). */
export async function findStudentCourse(tx: Tx, userId: string) {
  const [row] = await tx
    .select({ course: studentProfiles.course })
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId))
    .limit(1);
  return row?.course ?? null;
}

/** Имя автора объявления для DTO. */
export function findStaffName(tx: Tx, userId: string) {
  return tx
    .select(AUTHOR_SELECT)
    .from(staffProfiles)
    .where(eq(staffProfiles.userId, userId))
    .limit(1);
}

/**
 * Студенты аудитории объявления — те же правила, что audienceMatchesStudent (пересечение
 * критериев); результат — получатели notify при создании. facultyScope — факультет сотрудника:
 * дополнительный ограничитель (null — общевузовское подразделение).
 */
export function listAudienceStudentIds(
  tx: Tx,
  audience: { facultyIds: string[]; groupIds: string[]; courseNumbers: number[] },
  facultyScope: string | null,
) {
  const conditions = [
    audience.facultyIds.length > 0
      ? inArray(studentProfiles.facultyId, audience.facultyIds)
      : undefined,
    audience.groupIds.length > 0 ? inArray(studentProfiles.groupId, audience.groupIds) : undefined,
    audience.courseNumbers.length > 0
      ? inArray(studentProfiles.course, audience.courseNumbers)
      : undefined,
  ].filter((c): c is SQL => c !== undefined);
  if (conditions.length === 0) return Promise.resolve([]);
  if (facultyScope) conditions.push(eq(studentProfiles.facultyId, facultyScope));
  return tx
    .select({ userId: studentProfiles.userId })
    .from(studentProfiles)
    .where(and(...conditions));
}
