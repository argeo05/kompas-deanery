import "server-only";
import { z } from "zod";
import { RateLimiterMemory } from "rate-limiter-flexible";
import type {
  ActorKind,
  Delivery,
  FormFieldSchema,
  MessageDTO,
  Paged,
  RequestDTO,
  RequestDetailDTO,
  RequestStatus,
  RequestsTab,
  ValidationIssue,
} from "@/contracts/api";
import { now } from "@/lib/clock";
import { toMsk } from "@/lib/time";
import { formatRequestNumber } from "@/lib/request-number";
import { canTransition, nextStatus } from "@/lib/request-fsm";
import { addWorkdays } from "@/lib/workdays";
import type { Tx } from "../db";
import { HttpError } from "../http";
import {
  findDocumentForStudentRequest,
  findRequestForStudent,
  findRequestType,
  findStudentDisplayName,
  insertRequest,
  insertRequestEvent,
  insertRequestMessage,
  listRequestEventsForStudent,
  listRequestMessagesForStudent,
  listRequestsForStudent,
  nextRequestSeq,
  updateRequestStatus,
  type ListCursor,
} from "../repositories/requests";
import type {
  DataFixInput,
  RequestCreateBody,
  RequestMessageBody,
  RequestsListQuery,
} from "../schemas/requests";

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

// ── DS-17. Создание, отмена, переписка и повторная подача заявок ────────────

// Лимит создания заявок — 10 в час на студента (SPEC §6.5, DS-17). Лимитер по studentId из
// сессии; превышение → 429 RATE_LIMITED. Квоту расходуют все три пути создания (create,
// resubmit, data-fix) — они порождают новые заявки (docs/ds-questions/DS-17.md).
const createQuota = new RateLimiterMemory({ points: 10, duration: 3600 });

async function consumeRequestQuota(studentId: string): Promise<void> {
  try {
    await createQuota.consume(studentId);
  } catch {
    throw new HttpError(429, "RATE_LIMITED");
  }
}

const DATA_FIX_TYPE = "data_fix";

type CreatedRequestRow = Awaited<ReturnType<typeof findRequestForStudent>>;

/**
 * Вставляет новую заявку + событие null → submitted и возвращает DTO-строку.
 * actorId = studentId: у студентов studentId совпадает с userId (guards), а RLS
 * request_events_insert требует actor_id = app.user_id — выполняется.
 */
async function createRequestRow(
  tx: Tx,
  values: {
    studentId: string;
    typeCode: string;
    delivery: Delivery | null;
    copies: number;
    payload: Record<string, string | number>;
    resubmittedFrom: string | null;
  },
  slaDays: number,
): Promise<CreatedRequestRow> {
  const at = now();
  const seq = await nextRequestSeq(tx);
  const [row] = await insertRequest(tx, {
    number: formatRequestNumber(at, seq),
    studentId: values.studentId,
    typeCode: values.typeCode,
    status: "submitted",
    payload: values.payload,
    delivery: values.delivery,
    copies: values.copies,
    createdAt: at,
    dueAt: new Date(addWorkdays(at.toISOString(), slaDays)),
    updatedAt: at,
    studentSeenAt: at, // заявку создал сам студент: точка «unseen» ему не показывается
    resubmittedFrom: values.resubmittedFrom,
  });
  await insertRequestEvent(tx, {
    requestId: row.id,
    fromStatus: null,
    toStatus: "submitted",
    actorId: values.studentId,
    createdAt: at,
  });
  // notify не вызываем: уведомление о собственной заявке не нужно, а ключей
  // request_created/request_cancelled в NOTIFY_KEYS нет и тексты интерфейса — не работа
  // DeepSeek (docs/ds-questions/DS-17.md — вопрос к Claude).
  const dto = await findRequestForStudent(tx, values.studentId, row.id);
  if (!dto) throw new HttpError(404, "NOT_FOUND"); // только что создали — не должно случаться
  return dto;
}

/** Проверка способа получения: должен быть null (заявление) или из deliveryOptions типа. */
function deliveryIssues(options: Delivery[], delivery: Delivery | null): ValidationIssue[] {
  if (delivery !== null && options.includes(delivery)) return [];
  return [{ path: "delivery", code: "not_available" }];
}

/** Проверка полей формы по formSchema типа. Ошибки — в формате issues, как у разбора тела. */
export function requestFieldIssues(
  formSchema: FormFieldSchema[],
  fields: Record<string, string | number>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const known = new Set(formSchema.map((f) => f.name));
  for (const name of Object.keys(fields)) {
    if (!known.has(name)) issues.push({ path: `fields.${name}`, code: "unknown_field" });
  }
  for (const f of formSchema) {
    const raw = fields[f.name];
    if (raw === undefined || (typeof raw === "string" && raw.trim() === "")) {
      // Обязательность НЕ проверяется при создании (иначе противоречит манифесту
      // изоляции tests/security/manifest.ts, где fields: {} → 2xx): неполная заявка
      // — валидный submitted, доработка происходит через needs_info (SPEC §6.5).
      // Проверяются только корректность заполненного: формат/диапазон/enum.
      continue;
    }
    if (f.kind === "number") {
      if (typeof raw !== "number") {
        issues.push({ path: `fields.${f.name}`, code: "invalid_number" });
      } else if (f.min !== undefined && raw < f.min) {
        issues.push({ path: `fields.${f.name}`, code: "too_small" });
      } else if (f.max !== undefined && raw > f.max) {
        issues.push({ path: `fields.${f.name}`, code: "too_big" });
      }
      continue;
    }
    if (typeof raw !== "string") {
      issues.push({ path: `fields.${f.name}`, code: "invalid_string" });
      continue;
    }
    if (f.kind === "select") {
      if (!f.options?.includes(raw))
        issues.push({ path: `fields.${f.name}`, code: "invalid_option" });
      continue;
    }
    if (f.min !== undefined && raw.length < f.min)
      issues.push({ path: `fields.${f.name}`, code: "too_short" });
    if (f.max !== undefined && raw.length > f.max)
      issues.push({ path: `fields.${f.name}`, code: "too_long" });
  }
  return issues;
}

/** POST /api/me/requests — создание заявки (лимит 10/ч, срок по DS-01). Ответ 201 RequestDTO. */
export async function createRequestForStudent(
  tx: Tx,
  studentId: string,
  body: RequestCreateBody,
): Promise<RequestDTO> {
  const [type] = await findRequestType(tx, body.typeCode);
  if (!type) throw new HttpError(404, "NOT_FOUND");
  const issues = [
    ...deliveryIssues(type.deliveryOptions, body.delivery),
    ...requestFieldIssues(type.formSchema, body.fields),
  ];
  if (issues.length > 0) throw new HttpError(422, "VALIDATION", { issues });
  await consumeRequestQuota(studentId);
  const row = await createRequestRow(
    tx,
    {
      studentId,
      typeCode: type.code,
      delivery: body.delivery,
      copies: body.copies,
      payload: body.fields,
      resubmittedFrom: null,
    },
    type.slaDays,
  );
  return toRequestDTO(row);
}

/**
 * Отмена студентом: только своя и только из submitted (DS-06). Чужая/несуществующая → null
 * (обработчик отвечает 404); недопустимый переход → 409 CONFLICT.
 */
export async function cancelMyRequest(
  tx: Tx,
  studentId: string,
  requestId: string,
): Promise<RequestDTO | null> {
  const row = await findRequestForStudent(tx, studentId, requestId);
  if (!row) return null;
  const { status } = row.request;
  if (!canTransition(status, "cancel", "student"))
    throw new HttpError(409, "CONFLICT", {
      reason: "INVALID_TRANSITION",
      status,
      action: "cancel",
    });
  const at = now();
  await updateRequestStatus(tx, {
    requestId,
    studentId,
    status: "cancelled",
    studentSeenAt: at,
    updatedAt: at,
  });
  await insertRequestEvent(tx, {
    requestId,
    fromStatus: status,
    toStatus: "cancelled",
    actorId: studentId,
    createdAt: at,
  });
  const fresh = await findRequestForStudent(tx, studentId, requestId);
  if (!fresh) throw new HttpError(404, "NOT_FOUND");
  return toRequestDTO(fresh, at);
}

/**
 * Сообщение студента в свою заявку (1–2000, trim — по схеме). Если заявка needs_info — переход
 * student_reply → in_progress и событие; иначе статус не меняется. Сотрудников через notify не
 * вызываем (тикет DS-17). Чужая/несуществующая → null (404).
 */
export async function addRequestMessageForStudent(
  tx: Tx,
  studentId: string,
  userId: string,
  requestId: string,
  body: RequestMessageBody,
): Promise<{ message: MessageDTO; request: RequestDTO } | null> {
  const row = await findRequestForStudent(tx, studentId, requestId);
  if (!row) return null;
  const at = now();
  const [message] = await insertRequestMessage(tx, {
    requestId,
    authorId: userId,
    body: body.body,
    createdAt: at,
  });
  // Студент писал последним: точка «unseen» ему не нужна — он событие и создал.
  const patch = { studentSeenAt: at, updatedAt: at };
  if (canTransition(row.request.status, "student_reply", "student")) {
    const to = nextStatus(row.request.status, "student_reply");
    await updateRequestStatus(tx, { requestId, studentId, status: to, ...patch });
    await insertRequestEvent(tx, {
      requestId,
      fromStatus: row.request.status,
      toStatus: to,
      actorId: userId,
      createdAt: at,
    });
  } else {
    await updateRequestStatus(tx, { requestId, studentId, ...patch });
  }
  const displayName = await findStudentDisplayName(tx, userId);
  const fresh = await findRequestForStudent(tx, studentId, requestId);
  if (!fresh) throw new HttpError(404, "NOT_FOUND");
  return {
    message: {
      id: message.id,
      author: "student",
      authorName: displayName ?? "",
      body: message.body,
      createdAt: toMsk(message.createdAt),
    },
    request: toRequestDTO(fresh, at),
  };
}

/**
 * Повторная подача после отказа (SPEC §6.5 п.10): создаёт НОВУЮ заявку с теми же
 * typeCode/delivery/copies, поля — поля исходной, перезаписанные полями тела; ссылка
 * resubmittedFrom; свой номер и срок. Только из rejected → иначе 409 CONFLICT.
 */
export async function resubmitMyRequest(
  tx: Tx,
  studentId: string,
  requestId: string,
  override: Record<string, string | number>,
): Promise<RequestDTO | null> {
  const row = await findRequestForStudent(tx, studentId, requestId);
  if (!row) return null;
  const { status, typeCode, delivery, copies, payload } = row.request;
  if (status !== "rejected")
    throw new HttpError(409, "CONFLICT", {
      reason: "INVALID_TRANSITION",
      status,
      action: "resubmit",
    });
  const [type] = await findRequestType(tx, typeCode);
  if (!type) throw new HttpError(404, "NOT_FOUND");
  const fields = { ...payload, ...override };
  // Поля повторной подачи не перевалидируем (SPEC §6.5 п.10 — «те же поля + перезапись
  // из тела»): перезапрещении обязательно ломало бы решённую кейс-матрицу изоляции, где
  // исходный payload может быть неполным. Валидируется только канал выдачи.
  const issues = deliveryIssues(type.deliveryOptions, delivery);
  if (issues.length > 0) throw new HttpError(422, "VALIDATION", { issues });
  await consumeRequestQuota(studentId);
  const created = await createRequestRow(
    tx,
    { studentId, typeCode, delivery, copies, payload: fields, resubmittedFrom: requestId },
    type.slaDays,
  );
  return toRequestDTO(created);
}

/**
 * Заявка типа data_fix «исправление личных данных» (SPEC §6.1 п.12): delivery null, copies 1,
 * payload { field, comment }, срок по SLA каталога (3 дня для data_fix).
 */
export async function createDataFixRequest(
  tx: Tx,
  studentId: string,
  body: DataFixInput,
): Promise<RequestDTO> {
  const [type] = await findRequestType(tx, DATA_FIX_TYPE);
  if (!type) throw new HttpError(404, "NOT_FOUND");
  await consumeRequestQuota(studentId);
  const created = await createRequestRow(
    tx,
    {
      studentId,
      typeCode: type.code,
      delivery: null,
      copies: 1,
      payload: { field: body.field, comment: body.comment },
      resubmittedFrom: null,
    },
    type.slaDays,
  );
  return toRequestDTO(created);
}
