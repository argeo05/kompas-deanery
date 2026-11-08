import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type {
  MessageDTO,
  RequestStatus,
  StaffRequestDTO,
  StaffRequestRowDTO,
  StaffRequestsDTO,
  UUID,
} from "@/contracts/api";
import { canTransition, nextStatus } from "@/lib/request-fsm";
import { now } from "@/lib/clock";
import { toMsk } from "@/lib/time";
import type { StaffCtx } from "../auth/guards";
import type { Tx } from "../db";
import { audit } from "../audit";
import { HttpError } from "../http";
import { requestEvents, requestMessages, requests } from "../../../db/schema";
import { renderNotification, type RenderedNotification } from "../notify-templates";
import { notify } from "./notify";
import {
  findRequestForStaff,
  listRequestEventsForStaff,
  listRequestMessagesForStaff,
  listRequestsForStaff,
  loadStaffQueueCounters,
  type StaffListCursor,
} from "../repositories/staff-requests";
import type {
  StaffRequestMessageInput,
  StaffRequestsListQuery,
  StaffTransitionInput,
} from "../schemas/staff-requests";
import { staffShortName } from "./requests";

// Сервис очереди заявок сотрудника (DS-30, SPEC §6.9). Сервис собирает DTO из строк репозитория;
// все запросы выполняются в tx из withUserTx (app.user_id — сотрудник), область видимости —
// факультет ctx.facultyId (null — общевузовское подразделение, видит все факультеты).

type Row = Awaited<ReturnType<typeof listRequestsForStaff>>[number];
type EventRow = Awaited<ReturnType<typeof listRequestEventsForStaff>>[number];
type MessageRow = Awaited<ReturnType<typeof listRequestMessagesForStaff>>[number];

/** Статусы, в которых срок ещё может «пройти» (SPEC §6.5). */
const OPEN_STATUSES: ReadonlySet<RequestStatus> = new Set([
  "submitted",
  "in_progress",
  "needs_info",
]);

/** В статусах выдана/отказ/отменена переписка закрыта: заявка завершена. */
const MESSAGE_ALLOWED: ReadonlySet<RequestStatus> = new Set([
  "submitted",
  "in_progress",
  "needs_info",
  "ready",
]);

/** «Соколова Анна Дмитриевна» — данные студента для деканата (SPEC §6.9: ФИО, группа, программа, курс). */
function fullStudentName(p: { lastName: string; firstName: string; middleName: string | null }) {
  return p.middleName
    ? `${p.lastName} ${p.firstName} ${p.middleName}`
    : `${p.lastName} ${p.firstName}`;
}

/** «Елена М.» — короткое имя сотрудника; для заявок без ответственного — null (staffShortName). */
function shortAssignee(assignee: { firstName: string | null; lastName: string | null } | null) {
  return staffShortName(assignee ?? { firstName: null, lastName: null });
}

function overdueAt(status: RequestStatus, dueAt: Date, atNow: Date): boolean {
  return OPEN_STATUSES.has(status) && dueAt.getTime() < atNow.getTime();
}

function toStaffRowDTO(row: Row, atNow: Date): StaffRequestRowDTO {
  const r = row.request;
  return {
    id: r.id,
    number: r.number,
    typeTitle: row.type.title,
    student: {
      fullName: fullStudentName(row.student),
      group: row.student.groupTitle,
    },
    createdAt: toMsk(r.createdAt),
    dueAt: toMsk(r.dueAt),
    overdue: overdueAt(r.status, r.dueAt, atNow),
    status: r.status,
    assignee: shortAssignee(row.assignee),
  };
}

function toStaffRequestDTO(row: Row, events: EventRow[], messages: MessageRow[], atNow: Date) {
  const r = row.request;
  const dto: StaffRequestDTO = {
    id: r.id,
    number: r.number,
    type: { code: r.typeCode, title: row.type.title },
    status: r.status,
    delivery: r.delivery,
    copies: r.copies,
    fields: r.payload,
    createdAt: toMsk(r.createdAt),
    dueAt: toMsk(r.dueAt),
    overdue: overdueAt(r.status, r.dueAt, atNow),
    assignee: shortAssignee(row.assignee),
    student: {
      fullName: fullStudentName(row.student),
      group: row.student.groupTitle,
      program: row.student.programTitle,
      course: row.student.course,
    },
    events: events.map(({ event: e, staff }) => {
      const staffAuthor = e.actorId !== null && e.actorId !== r.studentId;
      return {
        id: e.id,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        actor: e.actorId === null ? "system" : staffAuthor ? "staff" : "student",
        actorName: staffAuthor ? shortAssignee(staff) : null,
        comment: e.comment,
        createdAt: toMsk(e.createdAt),
      };
    }),
    messages: messages.map(({ message: m, staff, studentDisplayName }) => {
      const author = m.authorId === r.studentId ? "student" : "staff";
      return {
        id: m.id,
        author,
        authorName:
          author === "student" ? (studentDisplayName ?? "") : (shortAssignee(staff) ?? ""),
        body: m.body,
        createdAt: toMsk(m.createdAt),
      };
    }),
  };
  return dto;
}

// ── список ──────────────────────────────────────────────────────────────────

// Курсор — base64url от «ISO-момент|id» последней строки страницы. Непрозрачен для клиента;
// поле (created_at или due_at) расшифровывается по ключу сортировки запроса.
function encodeCursor(c: { at: Date; id: string }): string {
  return Buffer.from(`${c.at.toISOString()}|${c.id}`).toString("base64url");
}

function decodeCursor(raw: string): { at: Date; id: string } {
  const [iso, id] = Buffer.from(raw, "base64url").toString("utf8").split("|");
  const at = new Date(iso ?? "");
  if (Number.isNaN(at.getTime()) || !z.uuid().safeParse(id).success) {
    throw new HttpError(422, "VALIDATION", {
      issues: [{ path: "cursor", code: "invalid_cursor" }],
    });
  }
  return { at, id };
}

export async function listStaffRequests(
  tx: Tx,
  ctx: StaffCtx,
  q: StaffRequestsListQuery,
): Promise<StaffRequestsDTO> {
  const scope = { facultyId: ctx.facultyId };
  const atNow = now();
  const cursor: StaffListCursor | null = q.cursor
    ? { key: q.sort, ...decodeCursor(q.cursor) }
    : null;

  const rows = await listRequestsForStaff(tx, {
    scope,
    filter: {
      status: q.status ?? null,
      typeCode: q.type ?? null,
      overdueOnly: q.overdue === "true",
      mineAssigneeId: q.mine === "true" ? ctx.userId : null,
    },
    sort: q.sort,
    cursor,
    limit: q.limit,
    now: atNow,
  });

  const page = rows.slice(0, q.limit);
  const last = page.at(-1);

  // Статистика всей очереди в области видимости; фильтры списка на неё не влияют.
  const [counters] = await loadStaffQueueCounters(tx, scope, atNow);

  return {
    items: page.map((row) => toStaffRowDTO(row, atNow)),
    nextCursor:
      rows.length > q.limit && last
        ? encodeCursor({
            at: q.sort === "dueAt" ? last.request.dueAt : last.request.createdAt,
            id: last.request.id,
          })
        : null,
    counters: {
      submitted: counters?.submitted ?? 0,
      inProgress: counters?.inProgress ?? 0,
      overdue: counters?.overdue ?? 0,
    },
  };
}

// ── карточка ────────────────────────────────────────────────────────────────

async function loadCard(tx: Tx, ctx: StaffCtx, requestId: UUID): Promise<StaffRequestDTO | null> {
  const scope = { facultyId: ctx.facultyId };
  const row = await findRequestForStaff(tx, scope, requestId);
  if (!row) return null;
  const [events, messages] = await Promise.all([
    listRequestEventsForStaff(tx, scope, requestId),
    listRequestMessagesForStaff(tx, scope, requestId),
  ]);
  return toStaffRequestDTO(row, events, messages, now());
}

/** null — чужой факультет, несуществующий или «кривой» id (обработчик отвечает 404). */
export async function getStaffRequest(
  tx: Tx,
  ctx: StaffCtx,
  requestId: UUID,
): Promise<StaffRequestDTO | null> {
  return loadCard(tx, ctx, requestId);
}

// ── переходы статуса (FSM DS-06) ────────────────────────────────────────────

/** Уведомление, соответствующее действию сотрудника (тексты ведёт Claude, сервис только рендерит). */
function notificationFor(
  action: StaffTransitionInput["action"],
  request: { title: string; number: string; delivery: StaffRequestDTO["delivery"] },
): RenderedNotification {
  switch (action) {
    case "take":
      return renderNotification("request_taken", {
        requestTitle: request.title,
        number: request.number,
      });
    case "need_info":
      return renderNotification("request_needs_info", {
        requestTitle: request.title,
        number: request.number,
      });
    case "ready":
      return renderNotification("request_ready", {
        requestTitle: request.title,
        number: request.number,
        electronic: request.delivery === "electronic",
      });
    case "issue":
      return renderNotification("request_issued", {
        requestTitle: request.title,
        number: request.number,
      });
    case "reject":
      return renderNotification("request_rejected", {
        requestTitle: request.title,
        number: request.number,
      });
  }
}

/**
 * Переход статуса заявки сотрудником. take дополнительно назначает исполнителя; reject
 * сохраняет причину. После перехода — событие, запись в audit_log и уведомление студенту:
 * needs_info и ready → срочное, остальные действия → личное (DS-30).
 */
export async function transitionStaffRequest(
  tx: Tx,
  ctx: StaffCtx,
  requestId: UUID,
  body: StaffTransitionInput,
): Promise<StaffRequestDTO | null> {
  const row = await findRequestForStaff(tx, { facultyId: ctx.facultyId }, requestId);
  if (!row) return null;
  const r = row.request;

  // Недопустимый переход по FSM (actor staff) — 409 CONFLICT.
  if (!canTransition(r.status, body.action, "staff")) throw new HttpError(409, "CONFLICT");
  const to = nextStatus(r.status, body.action);

  // need_info требует комментарий, reject — причину и комментарий (иначе 422).
  if (body.action === "need_info" && !body.comment) {
    throw new HttpError(422, "VALIDATION", { reason: "COMMENT_REQUIRED" });
  }
  if (body.action === "reject" && !(body.rejectReason && body.comment)) {
    throw new HttpError(422, "VALIDATION", { reason: "REJECT_REASON_REQUIRED" });
  }

  const atNow = now();
  await tx
    .update(requests)
    .set({
      status: to,
      assigneeId: body.action === "take" ? ctx.userId : r.assigneeId,
      rejectReason: body.action === "reject" ? (body.rejectReason ?? null) : r.rejectReason,
      updatedAt: atNow,
    })
    .where(eq(requests.id, requestId));

  await tx.insert(requestEvents).values({
    requestId,
    fromStatus: r.status,
    toStatus: to,
    actorId: ctx.userId,
    comment: body.comment ?? null,
    createdAt: atNow,
  });

  await audit(tx, "request.transition", "request", requestId, {
    action: body.action,
    from: r.status,
    to,
  });

  // Для ready электронных документов PDF собирает issueDocument (фаза C), notify тот же.
  // TODO(Claude, фаза C): issueDocument(tx, requestId) при ready и delivery = "electronic".
  const rendered = notificationFor(body.action, {
    title: row.type.title,
    number: r.number,
    delivery: r.delivery,
  });
  const cls = to === "needs_info" || to === "ready" ? "urgent" : rendered.class;
  await notify(tx, {
    studentIds: [r.studentId],
    class: cls,
    category: rendered.category,
    title: rendered.title,
    body: rendered.body,
    link: { kind: "request", id: requestId },
  });

  return loadCard(tx, ctx, requestId);
}

// ── сообщения сотрудника ────────────────────────────────────────────────────

/**
 * Сообщение сотрудника в переписке: статус (в том числе needs_info) не меняется, заявка
 * «обновляется» (updatedAt), студент получает уведомление. В завершённых статусах — 409.
 */
export async function addStaffMessage(
  tx: Tx,
  ctx: StaffCtx,
  requestId: UUID,
  input: StaffRequestMessageInput,
): Promise<MessageDTO | null> {
  const row = await findRequestForStaff(tx, { facultyId: ctx.facultyId }, requestId);
  if (!row) return null;
  const r = row.request;
  if (!MESSAGE_ALLOWED.has(r.status)) throw new HttpError(409, "CONFLICT");

  const atNow = now();
  const [message] = await tx
    .insert(requestMessages)
    .values({ requestId, authorId: ctx.userId, body: input.body, createdAt: atNow })
    .returning({
      id: requestMessages.id,
      body: requestMessages.body,
      createdAt: requestMessages.createdAt,
    });
  await tx.update(requests).set({ updatedAt: atNow }).where(eq(requests.id, requestId));

  // Отдельного ключа request_staff_message нет — используется готовый request_message;
  // класс (urgent для быстрого ответа) правит Claude в шаблоне, сервис класс не повышает.
  const rendered = renderNotification("request_message", {
    requestTitle: row.type.title,
    number: r.number,
  });
  await notify(tx, {
    studentIds: [r.studentId],
    class: rendered.class,
    category: rendered.category,
    title: rendered.title,
    body: rendered.body,
    link: { kind: "request", id: requestId },
  });

  return {
    id: message.id,
    author: "staff",
    authorName: shortAssignee(row.assignee) ?? "",
    body: message.body,
    createdAt: toMsk(message.createdAt),
  };
}
