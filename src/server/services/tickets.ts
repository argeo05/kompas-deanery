import "server-only";
import type { MessageDTO, TicketDTO, TicketDetailDTO, TicketsDTO } from "@/contracts/api";
import { now } from "@/lib/clock";
import { toMsk } from "@/lib/time";
import type { Tx } from "../db";
import { HttpError } from "../http";
import { isMyClass, listMyCourseIds } from "../repositories/schedule";
import {
  appendTicketMessage,
  findStudentDisplayName,
  findTicketForStudent,
  insertTicketWithMessage,
  listTicketMessagesForStudent,
  listTicketsForStudent,
  markTicketSeen,
  ownsCourse,
  ownsRequest,
  type TicketMessageRow,
  type TicketRow,
} from "../repositories/tickets";
import type { TicketCreateInput, TicketMessageInput } from "../schemas/tickets";
import { staffShortName } from "./requests";

// Сервис обращений студента (DS-21, SPEC §6.8.1): собирает DTO из строк репозитория.
// Без доступа к БД напрямую; ids только из сессии (ctx студента из requireStudent).

export interface TicketStudentCtx {
  studentId: string;
  userId: string;
  groupId: string;
}

/**
 * unread: после последнего «взгляда» студента (studentSeenAt, на создании/ответе/открытии карточки)
 * появилось сообщение. Сообщения студента сами обновляют studentSeenAt, поэтому «свежее» —
 * всегда от сотрудника.
 */
export function toTicketDTO(r: TicketRow): TicketDTO {
  return {
    id: r.id,
    topic: r.topic,
    status: r.status,
    createdAt: toMsk(r.createdAt),
    lastMessageAt: toMsk(r.lastMessageAt),
    unread: r.lastMessageAt.getTime() > (r.studentSeenAt ?? r.createdAt).getTime(),
  };
}

function toMessageDTO(
  studentId: string,
  row: {
    message: TicketMessageRow;
    staff: { firstName: string | null; lastName: string | null } | null;
    staffName: string | null;
    studentDisplayName: string | null;
  },
): MessageDTO {
  const m = row.message;
  const author = m.authorId === studentId ? ("student" as const) : ("staff" as const);
  return {
    id: m.id,
    author,
    // Сотрудник — по образцу заявок «Елена М.»; если профиля нет — ФИО из users (SPEC §6.8).
    authorName:
      author === "student"
        ? (row.studentDisplayName ?? "")
        : (staffShortName(row.staff ?? { firstName: null, lastName: null }) ?? row.staffName ?? ""),
    body: m.body,
    createdAt: toMsk(m.createdAt),
  };
}

/** GET /api/me/tickets → 200 TicketsDTO. */
export async function listMyTickets(tx: Tx, studentId: string): Promise<TicketsDTO> {
  const rows = await listTicketsForStudent(tx, studentId);
  return { items: rows.map(toTicketDTO) };
}

/**
 * Проверяет ссылку на объект: пара/заявка/дисциплина должны принадлежать студенту,
 * иначе — 404 NOT_FOUND (чужое = несуществующее).
 */
export async function validateTicketLink(
  tx: Tx,
  ctx: TicketStudentCtx,
  link: TicketCreateInput["link"],
): Promise<{ linkKind: "class" | "request" | "course"; linkId: string } | null> {
  if (!link) return null;
  const ok =
    link.kind === "request"
      ? await ownsRequest(tx, ctx.studentId, link.id)
      : link.kind === "course"
        ? await ownsCourse(tx, ctx.studentId, link.id)
        : await isMyClass(
            tx,
            { studentId: ctx.studentId, groupId: ctx.groupId },
            await listMyCourseIds(tx, { studentId: ctx.studentId, groupId: ctx.groupId }),
            link.id,
          );
  if (!ok) throw new HttpError(404, "NOT_FOUND");
  return { linkKind: link.kind, linkId: link.id };
}

/** POST /api/me/tickets → 201 TicketDTO (обёртка withIdempotency — в обработчике). */
export async function createMyTicket(
  tx: Tx,
  ctx: TicketStudentCtx,
  input: TicketCreateInput,
): Promise<TicketDTO> {
  const link = await validateTicketLink(tx, ctx, input.link);
  const row = await insertTicketWithMessage(tx, {
    studentId: ctx.studentId,
    authorId: ctx.userId,
    topic: input.topic,
    linkKind: link?.linkKind ?? null,
    linkId: link?.linkId ?? null,
    firstMessage: input.body,
    at: now(),
  });
  return toTicketDTO(row);
}

/**
 * GET /api/me/tickets/:id → 200 TicketDetailDTO | null (null — чужое или несуществующее → 404).
 * Открытие карточки гасит unread: студент увидел переписку.
 */
export async function getMyTicketDetail(
  tx: Tx,
  studentId: string,
  ticketId: string,
): Promise<TicketDetailDTO | null> {
  const ticket = await findTicketForStudent(tx, studentId, ticketId);
  if (!ticket) return null;
  const messages = await listTicketMessagesForStudent(tx, studentId, ticketId);
  await markTicketSeen(tx, studentId, ticketId, now());
  return { ...toTicketDTO(ticket), messages: messages.map((row) => toMessageDTO(studentId, row)) };
}

/**
 * POST /api/me/tickets/:id/messages → 201 MessageDTO | null (null — чужое/несуществующее → 404).
 * Обновляет lastMessageAt; в закрытое обращение писать нельзя (409). Статус студент не меняет.
 */
export async function addMyTicketMessage(
  tx: Tx,
  ctx: TicketStudentCtx,
  ticketId: string,
  input: TicketMessageInput,
): Promise<MessageDTO | null> {
  const ticket = await findTicketForStudent(tx, ctx.studentId, ticketId);
  if (!ticket) return null;
  if (ticket.status === "closed") throw new HttpError(409, "CONFLICT");
  const { message } = await appendTicketMessage(tx, {
    studentId: ctx.studentId,
    ticketId,
    authorId: ctx.userId,
    body: input.body,
    at: now(),
  });
  return {
    id: message.id,
    author: "student",
    authorName: (await findStudentDisplayName(tx, ctx.userId)) ?? "",
    body: message.body,
    createdAt: toMsk(message.createdAt),
  };
}
