import "server-only";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { RequestStatus } from "@/contracts/api";
import {
  groups,
  programs,
  requestEvents,
  requestMessages,
  requests,
  requestTypes,
  staffProfiles,
  studentProfiles,
} from "../../../db/schema";
import type { Tx } from "../db";

// Репозиторий очереди заявок для роли staff (DS-30, SPEC §6.9).
// Правила: функция принимает tx из withUserTx (app.user_id — сотрудник) и область видимости
// { facultyId } из сессии вызова requireStaff. NULL facultyId — общевузовское подразделение,
// видит все факультеты (units.faculty_id IS NULL, SPEC §5.4). Факультетская видимость дублируется
// в приложении через join student_profiles — RLS (db/migrations/0001_rls.sql) лишь страховка.

export type StaffScope = { facultyId: string | null };

export type StaffListCursor = {
  key: "createdAt" | "dueAt";
  at: Date;
  id: string;
};

/** Недопустимые (закрытые) статусы — по ним «срок прошёл» не считается просрочкой. */
export const OPEN_STATUSES = ["submitted", "in_progress", "needs_info"] as const;

/**
 * Статусы, где ход за деканатом: только по ним считается просрочка сотрудника.
 * «Нужно уточнение» — ход за студентом, сотрудник на срок повлиять не может (C11, R2-01).
 */
export const STAFF_TURN_STATUSES = ["submitted", "in_progress"] as const;

export interface StaffListOpts {
  scope: StaffScope;
  filter: {
    status: RequestStatus | null;
    typeCode: string | null;
    overdueOnly: boolean;
    /** Только открытые: отправлена, в работе, нужно уточнение. */
    openOnly?: boolean;
    /** mine=true — только заявки с assignee = этот сотрудник (или были напрямую назначены). */
    mineAssigneeId: string | null;
  };
  sort: "createdAt" | "dueAt";
  cursor: StaffListCursor | null;
  limit: number;
  now: Date;
}

function staffScopeCondition(scope: StaffScope) {
  return scope.facultyId ? eq(studentProfiles.facultyId, scope.facultyId) : undefined;
}

/** Заявки в области видимости сотрудника; limit + 1 строка — чтобы понять, есть ли следующая страница. */
export function listRequestsForStaff(tx: Tx, opts: StaffListOpts) {
  // Курсор сравнивается теми же выражениями, что и ORDER BY ниже (усечённое время, затем
  // номер DESC): иначе строки пропадали бы или дублировались между страницами (ревью DS-30).
  const cursor = (() => {
    if (opts.cursor === null) return undefined;
    const at = sql`date_trunc('second', ${opts.cursor.at.toISOString()}::timestamptz)`;
    const num = sql`(select ${requests.number} from ${requests} where ${requests.id} = ${opts.cursor.id}::uuid)`;
    const col = opts.cursor.key === "createdAt" ? requests.createdAt : requests.dueAt;
    const t = sql`date_trunc('second', ${col})`;
    return opts.cursor.key === "createdAt"
      ? sql`(${t} < ${at} or (${t} = ${at} and ${requests.number} < ${num}))` // новые первыми
      : sql`(${t} > ${at} or (${t} = ${at} and ${requests.number} < ${num}))`; // ранний срок первыми
  })();

  return (
    tx
      .select({
        request: requests,
        type: requestTypes,
        student: {
          lastName: studentProfiles.lastName,
          firstName: studentProfiles.firstName,
          middleName: studentProfiles.middleName,
          course: studentProfiles.course,
          programTitle: programs.title,
          groupTitle: groups.title,
        },
        assignee: { firstName: staffProfiles.firstName, lastName: staffProfiles.lastName },
      })
      .from(requests)
      .innerJoin(requestTypes, eq(requestTypes.code, requests.typeCode))
      .innerJoin(studentProfiles, eq(studentProfiles.userId, requests.studentId))
      .innerJoin(groups, eq(groups.id, studentProfiles.groupId))
      .innerJoin(programs, eq(programs.id, studentProfiles.programId))
      .leftJoin(staffProfiles, eq(staffProfiles.userId, requests.assigneeId))
      .where(
        and(
          staffScopeCondition(opts.scope),
          opts.filter.status ? eq(requests.status, opts.filter.status) : undefined,
          opts.filter.openOnly ? inArray(requests.status, [...OPEN_STATUSES]) : undefined,
          opts.filter.typeCode ? eq(requests.typeCode, opts.filter.typeCode) : undefined,
          // overdue=true: срок прошёл, а ход за деканатом (SPEC §6.5); «Нужно уточнение» не в счёт.
          opts.filter.overdueOnly
            ? and(lt(requests.dueAt, opts.now), inArray(requests.status, [...STAFF_TURN_STATUSES]))
            : undefined,
          opts.filter.mineAssigneeId
            ? eq(requests.assigneeId, opts.filter.mineAssigneeId)
            : undefined,
          cursor,
        ),
      )
      // createdAt — новые первыми; dueAt — близкий срок первыми. Срок усечён до секунды:
      // фикстуры тестов создают заявки за миллисекунды друг от друга, а пользователю важна
      // дата, а не миллисекунды. Внутри группы — чем больше номер (СП-ГГММ-NNNN, nextval),
      // тем свежее вставка: новые фикстуры не выпадают за пределы первой страницы.
      .orderBy(
        opts.sort === "dueAt"
          ? sql`date_trunc('second', ${requests.dueAt})`
          : desc(sql`date_trunc('second', ${requests.createdAt})`),
        desc(requests.number),
      )
      .limit(opts.limit + 1)
  );
}

/**
 * Счётчики очереди в области видимости: новые, в работе и просроченные.
 * Фильтры списка (status/type/overdue/mine) не меняют счётчики — это статистика всей очереди.
 */
export function loadStaffQueueCounters(tx: Tx, scope: StaffScope, now: Date) {
  return tx
    .select({
      submitted: sql<number>`count(*) filter (where ${requests.status} = 'submitted')::int`,
      inProgress: sql<number>`count(*) filter (where ${requests.status} = 'in_progress')::int`,
      overdue: sql<number>`count(*) filter (where ${requests.status} in ('submitted', 'in_progress') and ${requests.dueAt} < ${now.toISOString()}::timestamptz)::int`,
    })
    .from(requests)
    .innerJoin(studentProfiles, eq(studentProfiles.userId, requests.studentId))
    .where(staffScopeCondition(scope));
}

/** Заявка с данными студента (без оценок) и ответственным; null — нет её в области видимости сотрудника. */
export async function findRequestForStaff(tx: Tx, scope: StaffScope, requestId: string) {
  const [row] = await tx
    .select({
      request: requests,
      type: requestTypes,
      student: {
        lastName: studentProfiles.lastName,
        firstName: studentProfiles.firstName,
        middleName: studentProfiles.middleName,
        course: studentProfiles.course,
        programTitle: programs.title,
        groupTitle: groups.title,
      },
      assignee: { firstName: staffProfiles.firstName, lastName: staffProfiles.lastName },
    })
    .from(requests)
    .innerJoin(requestTypes, eq(requestTypes.code, requests.typeCode))
    .innerJoin(studentProfiles, eq(studentProfiles.userId, requests.studentId))
    .innerJoin(groups, eq(groups.id, studentProfiles.groupId))
    .innerJoin(programs, eq(programs.id, studentProfiles.programId))
    .leftJoin(staffProfiles, eq(staffProfiles.userId, requests.assigneeId))
    .where(and(eq(requests.id, requestId), staffScopeCondition(scope)))
    .limit(1);
  return row ?? null;
}

/** События заявки в области видимости сотрудника, по времени. */
export function listRequestEventsForStaff(tx: Tx, scope: StaffScope, requestId: string) {
  return (
    tx
      .select({
        event: requestEvents,
        staff: { firstName: staffProfiles.firstName, lastName: staffProfiles.lastName },
      })
      .from(requestEvents)
      .innerJoin(requests, eq(requests.id, requestEvents.requestId))
      .innerJoin(studentProfiles, eq(studentProfiles.userId, requests.studentId))
      .leftJoin(staffProfiles, eq(staffProfiles.userId, requestEvents.actorId))
      .where(and(eq(requestEvents.requestId, requestId), staffScopeCondition(scope)))
      // createdAt может совпасть (замороженные часы в тестах) — UUIDv4 id не сохраняет порядок
      // вставки, поэтому вторичный ключ — физический ctid (таблица только INSERT).
      .orderBy(asc(requestEvents.createdAt), sql`(request_events.ctid)::text`)
  );
}

/** Переписка по заявке в области видимости сотрудника, по времени. */
export function listRequestMessagesForStaff(tx: Tx, scope: StaffScope, requestId: string) {
  return tx
    .select({
      message: requestMessages,
      studentDisplayName: studentProfiles.displayName,
      staff: { firstName: staffProfiles.firstName, lastName: staffProfiles.lastName },
    })
    .from(requestMessages)
    .innerJoin(requests, eq(requests.id, requestMessages.requestId))
    .innerJoin(studentProfiles, eq(studentProfiles.userId, requests.studentId))
    .leftJoin(staffProfiles, eq(staffProfiles.userId, requestMessages.authorId))
    .where(and(eq(requestMessages.requestId, requestId), staffScopeCondition(scope)))
    .orderBy(asc(requestMessages.createdAt), sql`(request_messages.ctid)::text`);
}
