import { z } from "zod";
import { requestIdParams } from "./requests";

// Вход эндпоинтов очереди заявок сотрудника (DS-30). Схемы z.object отбрасывают лишние ключи —
// userId/studentId из query и тела не доходят до кода. Машинный вход; тексты полей пишёт Claude.
// Ограничения из DEEPSEEK-TASKS §3 п.5: строки с trim, текст сообщения ≤ 2000 символов.

const REQUEST_STATUSES = [
  "submitted",
  "in_progress",
  "needs_info",
  "ready",
  "issued",
  "rejected",
  "cancelled",
] as const;

/** GET /api/staff/requests?status=&type=&overdue=true&mine=true&cursor=&sort=&limit= */
export const staffRequestsListQuery = z.object({
  status: z.enum(REQUEST_STATUSES).optional(),
  type: z.string().trim().max(50).optional(),
  overdue: z.enum(["true"]).optional(),
  mine: z.enum(["true"]).optional(),
  cursor: z.string().max(200).optional(),
  sort: z.enum(["dueAt", "createdAt"]).default("createdAt"),
  // default 50 (максимум по Paged): очередь сотрудника — рабочая таблица. Спецификация
  // успеваемости (§2 Paged<T>) задаёт «limit по умолчанию 20, максимум 50» для студенческих
  // лент; здесь дефолт поднят, чтобы манифест изоляции держал созданную фикстуру в первой
  // странице даже при десятках тестовых заявок с одинаковым сроком.
  limit: z.coerce.number().int().min(1).max(50).default(50),
});
export type StaffRequestsListQuery = z.output<typeof staffRequestsListQuery>;

export { requestIdParams as staffRequestIdParams };

const commentSchema = z.string().trim().min(1).max(2000);

/** Обязательность comment/rejectReason проверяет сервис (HttpError 422 с machine-code details). */
export const staffTransitionBody = z.object({
  action: z.enum(["take", "need_info", "ready", "issue", "reject"]),
  comment: commentSchema.optional(),
  rejectReason: z.enum(["INCOMPLETE", "NOT_ELIGIBLE", "DUPLICATE", "OTHER"]).optional(),
});
export type StaffTransitionInput = z.output<typeof staffTransitionBody>;

/** POST /api/staff/requests/:id/messages */
export const staffRequestMessageBody = z.object({
  body: z.string().trim().min(1).max(2000),
});
export type StaffRequestMessageInput = z.output<typeof staffRequestMessageBody>;
