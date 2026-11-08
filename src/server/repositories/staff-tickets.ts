import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { TicketStatus } from "@/contracts/api";
import {
  groups,
  staffProfiles,
  studentProfiles,
  ticketMessages,
  tickets,
  users,
} from "../../../db/schema";
import type { Tx } from "../db";

// Репозиторий обращений для роли staff (DS-33, SPEC §6.8.2). Правила: функция принимает tx из
// withUserTx (app.user_id — сотрудник) и область видимости { facultyId } из requireStaff.
// NULL facultyId — общевузовское подразделение (студенческий офис), видит все факультеты.
// Факультетская видимость дублируется через join student_profiles — RLS (0001_rls.sql) лишь
// страховка. Функций «по id без области видимости» здесь нет и быть не должно.

export type StaffScope = { facultyId: string | null };

function staffScopeCondition(scope: StaffScope) {
  return scope.facultyId ? eq(studentProfiles.facultyId, scope.facultyId) : undefined;
}

/** Обращения в области видимости сотрудника, свежие первыми (по последнему сообщению). */
export function listTicketsForStaff(tx: Tx, scope: StaffScope, status: TicketStatus | null) {
  return tx
    .select({
      ticket: tickets,
      student: {
        lastName: studentProfiles.lastName,
        firstName: studentProfiles.firstName,
        middleName: studentProfiles.middleName,
        groupTitle: groups.title,
      },
    })
    .from(tickets)
    .innerJoin(studentProfiles, eq(studentProfiles.userId, tickets.studentId))
    .innerJoin(groups, eq(groups.id, studentProfiles.groupId))
    .where(and(staffScopeCondition(scope), status ? eq(tickets.status, status) : undefined))
    .orderBy(desc(tickets.lastMessageAt), desc(tickets.id));
}

/** Обращение с данными студента в области видимости; null — чужое или несуществующее. */
export async function findTicketForStaff(tx: Tx, scope: StaffScope, ticketId: string) {
  const [row] = await tx
    .select({
      ticket: tickets,
      student: {
        lastName: studentProfiles.lastName,
        firstName: studentProfiles.firstName,
        middleName: studentProfiles.middleName,
        groupTitle: groups.title,
      },
    })
    .from(tickets)
    .innerJoin(studentProfiles, eq(studentProfiles.userId, tickets.studentId))
    .innerJoin(groups, eq(groups.id, studentProfiles.groupId))
    .where(and(eq(tickets.id, ticketId), staffScopeCondition(scope)))
    .limit(1);
  return row ?? null;
}

/**
 * Переписка обращения в области видимости, по времени. Имя автора: студент — displayName
 * владельца обращения, сотрудник — профиль staff (или users.name, если профиля нет).
 */
export function listTicketMessagesForStaff(tx: Tx, scope: StaffScope, ticketId: string) {
  return (
    tx
      .select({
        message: ticketMessages,
        staff: { firstName: staffProfiles.firstName, lastName: staffProfiles.lastName },
        staffName: users.name,
        studentDisplayName: studentProfiles.displayName,
      })
      .from(ticketMessages)
      .innerJoin(tickets, eq(tickets.id, ticketMessages.ticketId))
      .innerJoin(studentProfiles, eq(studentProfiles.userId, tickets.studentId))
      .leftJoin(users, eq(users.id, ticketMessages.authorId))
      .leftJoin(staffProfiles, eq(staffProfiles.userId, ticketMessages.authorId))
      .where(and(eq(ticketMessages.ticketId, ticketId), staffScopeCondition(scope)))
      // createdAt может совпасть (замороженные часы в тестах) — UUIDv4 не сохраняет порядок
      // вставки, поэтому вторичный ключ — физический ctid (как в репозитории заявок).
      .orderBy(asc(ticketMessages.createdAt), sql`(ticket_messages.ctid)::text`)
  );
}

export interface StaffAppendedMessage {
  message: typeof ticketMessages.$inferSelect;
  ticket: typeof tickets.$inferSelect;
}

/**
 * Сообщение сотрудника: вставка и обновление lastMessageAt со статусом answered.
 * studentSeenAt НЕ трогаем — ответ сотрудника должен остаться непрочитанным для студента.
 */
export async function appendStaffTicketMessage(
  tx: Tx,
  input: { ticketId: string; authorId: string; body: string; at: Date },
): Promise<StaffAppendedMessage> {
  const [message] = await tx
    .insert(ticketMessages)
    .values({
      ticketId: input.ticketId,
      authorId: input.authorId,
      body: input.body,
      createdAt: input.at,
    })
    .returning();
  // Статус open → answered (уже answered — остаётся; closed исключён сервисом: 409).
  const [ticket] = await tx
    .update(tickets)
    .set({ lastMessageAt: input.at, status: "answered" })
    .where(eq(tickets.id, input.ticketId))
    .returning();
  return { message, ticket };
}

/** Закрытие обращения: status = closed (lastMessageAt не трогаем — сообщений не добавлялось). */
export async function closeTicketRow(
  tx: Tx,
  ticketId: string,
): Promise<typeof tickets.$inferSelect> {
  const [ticket] = await tx
    .update(tickets)
    .set({ status: "closed" })
    .where(eq(tickets.id, ticketId))
    .returning();
  return ticket;
}

/** Профиль сотрудника по его userId (для подписи своего сообщения); без профиля — nulls + users.name. */
export async function findStaffProfile(
  tx: Tx,
  userId: string,
): Promise<{ firstName: string | null; lastName: string | null }> {
  const [row] = await tx
    .select({ firstName: staffProfiles.firstName, lastName: staffProfiles.lastName })
    .from(staffProfiles)
    .where(eq(staffProfiles.userId, userId))
    .limit(1);
  return row ?? { firstName: null, lastName: null };
}
