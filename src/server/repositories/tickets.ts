import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  requests,
  staffProfiles,
  studentProfiles,
  ticketMessages,
  tickets,
  users,
} from "../../../db/schema";
import { enrollments } from "../../../db/schema/study";
import type { TicketTopic } from "@/contracts/api";
import type { Tx } from "../db";

// Репозиторий обращений для роли student (DS-21, SPEC §6.8).
// Правила: функция принимает tx из withUserTx и studentId из сессии; КАЖДЫЙ запрос содержит
// eq(tickets.studentId, studentId) (или проверку владельца через join). Функций «по id без
// владельца» здесь нет и быть не должно.

export type TicketRow = typeof tickets.$inferSelect;
export type TicketMessageRow = typeof ticketMessages.$inferSelect;

/** Обращения студента, свежие первыми (по последнему сообщению). */
export function listTicketsForStudent(tx: Tx, studentId: string) {
  return tx
    .select()
    .from(tickets)
    .where(eq(tickets.studentId, studentId))
    .orderBy(desc(tickets.lastMessageAt), desc(tickets.id));
}

/** Обращение студента; null — нет такого у этого студента. */
export async function findTicketForStudent(
  tx: Tx,
  studentId: string,
  ticketId: string,
): Promise<TicketRow | null> {
  const [row] = await tx
    .select()
    .from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.studentId, studentId)))
    .limit(1);
  return row ?? null;
}

/** Переписка обращения по времени. Имя автора: студент — displayName, сотрудник — профиль. */
export function listTicketMessagesForStudent(tx: Tx, studentId: string, ticketId: string) {
  return tx
    .select({
      message: ticketMessages,
      staff: { firstName: staffProfiles.firstName, lastName: staffProfiles.lastName },
      staffName: users.name,
      studentDisplayName: studentProfiles.displayName,
    })
    .from(ticketMessages)
    .innerJoin(tickets, eq(tickets.id, ticketMessages.ticketId))
    .leftJoin(users, eq(users.id, ticketMessages.authorId))
    .leftJoin(staffProfiles, eq(staffProfiles.userId, ticketMessages.authorId))
    .leftJoin(studentProfiles, eq(studentProfiles.userId, ticketMessages.authorId))
    .where(and(eq(ticketMessages.ticketId, ticketId), eq(tickets.studentId, studentId)))
    .orderBy(asc(ticketMessages.createdAt), asc(ticketMessages.id));
}

/** Имя автора-студента по владельцу (displayName), для подписи своих сообщений. */
export async function findStudentDisplayName(tx: Tx, userId: string): Promise<string | null> {
  const [row] = await tx
    .select({ displayName: studentProfiles.displayName })
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId))
    .limit(1);
  return row?.displayName ?? null;
}

/** Создание обращения + первое сообщение; lastMessageAt = studentSeenAt = момент создания. */
export async function insertTicketWithMessage(
  tx: Tx,
  input: {
    studentId: string;
    authorId: string;
    topic: TicketTopic;
    linkKind: "class" | "request" | "course" | null;
    linkId: string | null;
    firstMessage: string;
    at: Date;
  },
): Promise<TicketRow> {
  const [row] = await tx
    .insert(tickets)
    .values({
      studentId: input.studentId,
      topic: input.topic,
      status: "open",
      linkKind: input.linkKind,
      linkId: input.linkId,
      createdAt: input.at,
      lastMessageAt: input.at,
      studentSeenAt: input.at,
    })
    .returning();
  await tx.insert(ticketMessages).values({
    ticketId: row.id,
    authorId: input.authorId,
    body: input.firstMessage,
    createdAt: input.at,
  });
  return row;
}

export interface AppendedMessage {
  message: TicketMessageRow;
  ticket: TicketRow;
}

/** Сообщение студента: вставка, обновление lastMessageAt; студент всё увидел — studentSeenAt = now. */
export async function appendTicketMessage(
  tx: Tx,
  input: { studentId: string; ticketId: string; authorId: string; body: string; at: Date },
): Promise<AppendedMessage> {
  const [message] = await tx
    .insert(ticketMessages)
    .values({
      ticketId: input.ticketId,
      authorId: input.authorId,
      body: input.body,
      createdAt: input.at,
    })
    .returning();
  const [ticket] = await tx
    .update(tickets)
    .set({ lastMessageAt: input.at, studentSeenAt: input.at })
    .where(and(eq(tickets.id, input.ticketId), eq(tickets.studentId, input.studentId)))
    .returning();
  return { message, ticket };
}

/** Карточку открыли — непрочитанное прочитано (unread гаснет, пока не придёт ответ сотрудника). */
export async function markTicketSeen(
  tx: Tx,
  studentId: string,
  ticketId: string,
  at: Date,
): Promise<void> {
  await tx
    .update(tickets)
    .set({ studentSeenAt: at })
    .where(and(eq(tickets.id, ticketId), eq(tickets.studentId, studentId)));
}

/** Принадлежит ли заявка студенту (для ссылки kind = request). */
export async function ownsRequest(tx: Tx, studentId: string, requestId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: requests.id })
    .from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.studentId, studentId)))
    .limit(1);
  return row !== undefined;
}

/** Записан ли студент на дисциплину (для ссылки kind = course). */
export async function ownsCourse(tx: Tx, studentId: string, courseId: string): Promise<boolean> {
  const [row] = await tx
    .select({ studentId: enrollments.studentId })
    .from(enrollments)
    .where(and(eq(enrollments.courseId, courseId), eq(enrollments.studentId, studentId)))
    .limit(1);
  return row !== undefined;
}
