import "server-only";
import type { MessageDTO, StaffTicketDetailDTO, StaffTicketRowDTO } from "@/contracts/api";
import { now } from "@/lib/clock";
import { toMsk } from "@/lib/time";
import type { StaffCtx } from "../auth/guards";
import type { Tx } from "../db";
import { audit } from "../audit";
import { HttpError } from "../http";
import { renderNotification } from "../notify-templates";
import { notify } from "./notify";
import {
  appendStaffTicketMessage,
  closeTicketRow,
  findStaffProfile,
  findTicketForStaff,
  listTicketMessagesForStaff,
  listTicketsForStaff,
  type StaffScope,
} from "../repositories/staff-tickets";
import type {
  StaffTicketIdParams,
  StaffTicketMessageInput,
  StaffTicketsListQuery,
} from "../schemas/staff-tickets";
import { staffShortName } from "./requests";
import { toTicketDTO } from "./tickets";

// Сервис обращений для роли staff (DS-33, SPEC §6.8.2). Сервис собирает DTO из строк
// репозитория; все запросы выполняются в tx из withUserTx (app.user_id — сотрудник),
// область видимости — факультет ctx.facultyId (null — общевузовское подразделение, видит
// все факультеты). Идентификаторы — из requireStaff; studentId/userId из запроса не читаются.
// Сервисы студента (services/tickets.ts, DS-21) используются по чтению (toTicketDTO);
// их файл не изменяется.

type Row = Awaited<ReturnType<typeof listTicketsForStaff>>[number];
type MessageRow = Awaited<ReturnType<typeof listTicketMessagesForStaff>>[number];

/** «Соколова Анна Дмитриевна» — данные студента для деканата (SPEC §6.9: ФИО, группа). */
function fullStudentName(p: { lastName: string; firstName: string; middleName: string | null }) {
  return p.middleName
    ? `${p.lastName} ${p.firstName} ${p.middleName}`
    : `${p.lastName} ${p.firstName}`;
}

function toStaffRowDTO(row: Row): StaffTicketRowDTO {
  return {
    ...toTicketDTO(row.ticket),
    student: { fullName: fullStudentName(row.student), group: row.student.groupTitle },
  };
}

function toMessageDTO(ticketStudentId: string, row: MessageRow): MessageDTO {
  const m = row.message;
  const author = m.authorId === ticketStudentId ? ("student" as const) : ("staff" as const);
  return {
    id: m.id,
    author,
    // Сотрудник — по образцу заявок «Елена М.»; если профиля нет — имя из users (SPEC §6.8).
    authorName:
      author === "student"
        ? (row.studentDisplayName ?? "")
        : (staffShortName(row.staff ?? { firstName: null, lastName: null }) ?? row.staffName ?? ""),
    body: m.body,
    createdAt: toMsk(m.createdAt),
  };
}

// ── список ──────────────────────────────────────────────────────────────────

/** GET /api/staff/tickets?status= → 200 { items: StaffTicketRowDTO[] }, свежие первыми. */
export async function listStaffTickets(
  tx: Tx,
  ctx: StaffCtx,
  q: StaffTicketsListQuery,
): Promise<{ items: StaffTicketRowDTO[] }> {
  const scope: StaffScope = { facultyId: ctx.facultyId };
  const rows = await listTicketsForStaff(tx, scope, q.status ?? null);
  return { items: rows.map(toStaffRowDTO) };
}

// ── карточка ────────────────────────────────────────────────────────────────

/**
 * GET /api/staff/tickets/:id → 200 StaffTicketDetailDTO | null (null — чужой факультет,
 * несуществующий или «кривой» id → обработчик отвечает 404). Открытие карточки сотрудником
 * прочтение не гасит: unread студента считается по studentSeenAt со стороны DS-21.
 */
export async function getStaffTicket(
  tx: Tx,
  ctx: StaffCtx,
  ticketId: StaffTicketIdParams["id"],
): Promise<StaffTicketDetailDTO | null> {
  const scope: StaffScope = { facultyId: ctx.facultyId };
  const row = await findTicketForStaff(tx, scope, ticketId);
  if (!row) return null;
  const messages = await listTicketMessagesForStaff(tx, scope, ticketId);
  return {
    ...toStaffRowDTO(row),
    messages: messages.map((m) => toMessageDTO(row.ticket.studentId, m)),
  };
}

// ── ответ сотрудника ────────────────────────────────────────────────────────

/**
 * POST /api/staff/tickets/:id/messages → 201 MessageDTO | null (null — чужое/несуществующее
 * → 404). Статус → answered, lastMessageAt = now; studentSeenAt не трогаем — у студента
 * появляется unread (гаснет, когда студент откроет карточку — механика seen из DS-21).
 * В закрытое обращение писать нельзя — 409 CONFLICT.
 */
export async function addStaffTicketMessage(
  tx: Tx,
  ctx: StaffCtx,
  ticketId: StaffTicketIdParams["id"],
  input: StaffTicketMessageInput,
): Promise<MessageDTO | null> {
  const scope: StaffScope = { facultyId: ctx.facultyId };
  const row = await findTicketForStaff(tx, scope, ticketId);
  if (!row) return null;
  if (row.ticket.status === "closed") throw new HttpError(409, "CONFLICT");

  const at = now();
  const { message, ticket } = await appendStaffTicketMessage(tx, {
    ticketId,
    authorId: ctx.userId,
    body: input.body,
    at,
  });

  await audit(tx, "ticket.reply", "ticket", ticketId, {});

  // Уведомление студенту: ключ ticket_answered, класс personal из шаблона (urgent-ключа для
  // обращений в notify-templates нет, а «повысить личное до срочного нельзя без решения
  // Claude») — решение по классу задокументировано в отчёте DS-33.
  const rendered = renderNotification("ticket_answered", { topic: ticket.topic });
  await notify(tx, {
    studentIds: [ticket.studentId],
    class: rendered.class,
    category: rendered.category,
    title: rendered.title,
    body: rendered.body,
    link: { kind: "ticket", id: ticketId },
  });

  const profile = await findStaffProfile(tx, ctx.userId);
  return {
    id: message.id,
    author: "staff",
    authorName: staffShortName(profile) ?? "",
    body: message.body,
    createdAt: toMsk(message.createdAt),
  };
}

// ── закрытие ────────────────────────────────────────────────────────────────

/**
 * POST /api/staff/tickets/:id/close → 200 StaffTicketRowDTO | null (null → 404).
 * Статус → closed; повторное закрытие — 409 CONFLICT. После закрытия переписка заморожена
 * для обеих сторон (409 студенту уже реализовано в DS-21). lastMessageAt не трогаем —
 * сообщений не добавлялось, unread у студента не появляется.
 * Уведомление НЕ отправляется: ключа вида «обращение закрыто» в notify-templates нет
 * (файл ведёт Claude; предложение — добавить ключ ticket_closed). О закрытии студент
 * видит статус в карточке обращения.
 */
export async function closeStaffTicket(
  tx: Tx,
  ctx: StaffCtx,
  ticketId: StaffTicketIdParams["id"],
): Promise<StaffTicketRowDTO | null> {
  const scope: StaffScope = { facultyId: ctx.facultyId };
  const row = await findTicketForStaff(tx, scope, ticketId);
  if (!row) return null;
  if (row.ticket.status === "closed") throw new HttpError(409, "CONFLICT");

  const ticket = await closeTicketRow(tx, ticketId);
  await audit(tx, "ticket.close", "ticket", ticketId, { from: row.ticket.status, to: "closed" });

  return toStaffRowDTO({ ticket, student: row.student });
}
