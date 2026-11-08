import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  documents,
  requestEvents,
  requestMessages,
  requests,
  requestTypes,
  staffProfiles,
  studentProfiles,
  units,
} from "../../../db/schema";
import type { RequestStatus } from "@/contracts/api";
import type { Tx } from "../db";

// Репозиторий заявок для роли student (SPEC §9.3 п.1).
// Правила: функция принимает tx из withUserTx и studentId из сессии; КАЖДЫЙ запрос содержит
// eq(requests.studentId, studentId). Функций «по id без владельца» здесь нет и быть не должно.

export interface ListCursor {
  createdAt: Date;
  id: string;
}

/** Заявки студента, новые первыми; limit + 1 строк — чтобы понять, есть ли следующая страница. */
export function listRequestsForStudent(
  tx: Tx,
  studentId: string,
  opts: { statuses: RequestStatus[] | null; cursor: ListCursor | null; limit: number },
) {
  return tx
    .select({ request: requests, typeTitle: requestTypes.title })
    .from(requests)
    .innerJoin(requestTypes, eq(requestTypes.code, requests.typeCode))
    .where(
      and(
        eq(requests.studentId, studentId),
        opts.statuses ? inArray(requests.status, opts.statuses) : undefined,
        opts.cursor
          ? sql`(${requests.createdAt}, ${requests.id}) < (${opts.cursor.createdAt.toISOString()}::timestamptz, ${opts.cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(requests.createdAt), desc(requests.id))
    .limit(opts.limit + 1);
}

/** Заявка студента с типом и ответственным; null — нет такой у этого студента. */
export async function findRequestForStudent(tx: Tx, studentId: string, requestId: string) {
  const [row] = await tx
    .select({
      request: requests,
      typeTitle: requestTypes.title,
      assignee: { firstName: staffProfiles.firstName, lastName: staffProfiles.lastName },
      unit: { title: units.title, place: units.place, hours: units.hours },
    })
    .from(requests)
    .innerJoin(requestTypes, eq(requestTypes.code, requests.typeCode))
    .leftJoin(staffProfiles, eq(staffProfiles.userId, requests.assigneeId))
    .leftJoin(units, eq(units.id, staffProfiles.unitId))
    .where(and(eq(requests.id, requestId), eq(requests.studentId, studentId)))
    .limit(1);
  return row ?? null;
}

/** События заявки студента по времени. Имя есть только у сотрудников. */
export function listRequestEventsForStudent(tx: Tx, studentId: string, requestId: string) {
  return tx
    .select({
      event: requestEvents,
      requestStudentId: requests.studentId,
      staff: { firstName: staffProfiles.firstName, lastName: staffProfiles.lastName },
    })
    .from(requestEvents)
    .innerJoin(requests, eq(requests.id, requestEvents.requestId))
    .leftJoin(staffProfiles, eq(staffProfiles.userId, requestEvents.actorId))
    .where(and(eq(requestEvents.requestId, requestId), eq(requests.studentId, studentId)))
    .orderBy(asc(requestEvents.createdAt), asc(requestEvents.id));
}

/** Переписка по заявке студента по времени. */
export function listRequestMessagesForStudent(tx: Tx, studentId: string, requestId: string) {
  return tx
    .select({
      message: requestMessages,
      requestStudentId: requests.studentId,
      staff: { firstName: staffProfiles.firstName, lastName: staffProfiles.lastName },
      studentDisplayName: studentProfiles.displayName,
    })
    .from(requestMessages)
    .innerJoin(requests, eq(requests.id, requestMessages.requestId))
    .leftJoin(staffProfiles, eq(staffProfiles.userId, requestMessages.authorId))
    .leftJoin(studentProfiles, eq(studentProfiles.userId, requestMessages.authorId))
    .where(and(eq(requestMessages.requestId, requestId), eq(requests.studentId, studentId)))
    .orderBy(asc(requestMessages.createdAt), asc(requestMessages.id));
}

/** Действующий (не отозванный) документ по заявке студента. */
export async function findDocumentForStudentRequest(tx: Tx, studentId: string, requestId: string) {
  const [row] = await tx
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.requestId, requestId),
        eq(documents.studentId, studentId),
        sql`${documents.revokedAt} IS NULL`,
      ),
    )
    .orderBy(desc(documents.issuedAt))
    .limit(1);
  return row ?? null;
}
