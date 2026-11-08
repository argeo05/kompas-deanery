import "server-only";
import { z } from "zod";
import type {
  ActorKind,
  Paged,
  RequestDetailDTO,
  RequestDTO,
  RequestStatus,
  RequestsTab,
} from "@/contracts/api";
import { now } from "@/lib/clock";
import { toMsk } from "@/lib/time";
import type { Tx } from "../db";
import { HttpError } from "../http";
import {
  findDocumentForStudentRequest,
  findRequestForStudent,
  listRequestEventsForStudent,
  listRequestMessagesForStudent,
  listRequestsForStudent,
  type ListCursor,
} from "../repositories/requests";
import type { RequestsListQuery } from "../schemas/requests";

// Сервис заявок студента: собирает DTO из строк репозитория. Без доступа к БД напрямую.

const TAB_STATUSES: Record<RequestsTab, RequestStatus[] | null> = {
  active: ["submitted", "in_progress", "needs_info", "ready"],
  archive: ["issued", "rejected", "cancelled"],
  all: null,
};

/** Статусы, в которых срок ещё может «пройти». */
const OPEN_STATUSES: ReadonlySet<RequestStatus> = new Set([
  "submitted",
  "in_progress",
  "needs_info",
]);

type RequestRow = Awaited<ReturnType<typeof listRequestsForStudent>>[number];

/** «Елена С.» — имя и инициал фамилии сотрудника (SPEC §6.5 п.5). */
export function staffShortName(p: {
  firstName: string | null;
  lastName: string | null;
}): string | null {
  if (!p.firstName || !p.lastName) return null;
  return `${p.firstName} ${p.lastName.slice(0, 1)}.`;
}

export function toRequestDTO({ request: r, typeTitle }: RequestRow, at: Date = now()): RequestDTO {
  return {
    id: r.id,
    number: r.number,
    type: { code: r.typeCode, title: typeTitle },
    status: r.status,
    delivery: r.delivery,
    copies: r.copies,
    createdAt: toMsk(r.createdAt),
    dueAt: toMsk(r.dueAt),
    updatedAt: toMsk(r.updatedAt),
    overdue: OPEN_STATUSES.has(r.status) && r.dueAt.getTime() < at.getTime(),
    unseen: r.updatedAt.getTime() > (r.studentSeenAt ?? r.createdAt).getTime(),
    resubmittedFrom: r.resubmittedFrom,
  };
}

// Курсор — base64url от «createdAt ISO|id» последней строки страницы. Непрозрачен для клиента.
function encodeCursor(c: ListCursor): string {
  return Buffer.from(`${c.createdAt.toISOString()}|${c.id}`).toString("base64url");
}

function decodeCursor(raw: string): ListCursor {
  const [iso, id] = Buffer.from(raw, "base64url").toString("utf8").split("|");
  const createdAt = new Date(iso ?? "");
  // id проверяем строго: строка из 36 дефисов прошла бы простую регулярку и уронила бы ::uuid в БД (500).
  if (Number.isNaN(createdAt.getTime()) || !z.uuid().safeParse(id).success) {
    throw new HttpError(422, "VALIDATION", {
      issues: [{ path: "cursor", code: "invalid_cursor" }],
    });
  }
  return { createdAt, id };
}

export async function listMyRequests(
  tx: Tx,
  studentId: string,
  q: RequestsListQuery,
): Promise<Paged<RequestDTO>> {
  const rows = await listRequestsForStudent(tx, studentId, {
    statuses: TAB_STATUSES[q.tab],
    cursor: q.cursor ? decodeCursor(q.cursor) : null,
    limit: q.limit,
  });
  const page = rows.slice(0, q.limit);
  const last = page.at(-1);
  const at = now();
  return {
    items: page.map((row) => toRequestDTO(row, at)),
    nextCursor:
      rows.length > q.limit && last
        ? encodeCursor({ createdAt: last.request.createdAt, id: last.request.id })
        : null,
  };
}

/** Карточка заявки; null — нет такой у этого студента (обработчик отвечает 404). */
export async function getMyRequest(
  tx: Tx,
  studentId: string,
  requestId: string,
): Promise<RequestDetailDTO | null> {
  const row = await findRequestForStudent(tx, studentId, requestId);
  if (!row) return null;
  const [events, messages, document] = await Promise.all([
    listRequestEventsForStudent(tx, studentId, requestId),
    listRequestMessagesForStudent(tx, studentId, requestId),
    findDocumentForStudentRequest(tx, studentId, requestId),
  ]);
  const r = row.request;

  const actorOf = (actorId: string | null): ActorKind =>
    actorId === null ? "system" : actorId === r.studentId ? "student" : "staff";
  const rejectedEvent = events.findLast((e) => e.event.toStatus === "rejected");
  const assigneeName = staffShortName(row.assignee ?? { firstName: null, lastName: null });

  return {
    ...toRequestDTO(row),
    fields: r.payload,
    assignee: assigneeName && row.unit ? { name: assigneeName, unit: row.unit.title } : null,
    rejection:
      r.status === "rejected" && r.rejectReason
        ? { reason: r.rejectReason, comment: rejectedEvent?.event.comment ?? null }
        : null,
    events: events.map(({ event: e, staff }) => {
      const actor = actorOf(e.actorId);
      return {
        id: e.id,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        actor,
        actorName:
          actor === "staff" ? staffShortName(staff ?? { firstName: null, lastName: null }) : null,
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
          (author === "student"
            ? studentDisplayName
            : staffShortName(staff ?? { firstName: null, lastName: null })) ?? "",
        body: m.body,
        createdAt: toMsk(m.createdAt),
      };
    }),
    document: document
      ? { id: document.id, fileUrl: `/api/me/documents/${document.id}/file` }
      : null,
    pickup:
      r.delivery === "original" && (r.status === "ready" || r.status === "issued") && row.unit
        ? { place: row.unit.place, hours: row.unit.hours }
        : null,
  };
}
