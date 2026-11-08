import { z } from "zod";

// Вход эндпоинтов заявок. Схемы z.object отбрасывают лишние ключи — studentId/userId из query не доходят до кода.

/** GET /api/me/requests?tab=active|archive|all&cursor=&limit= */
export const requestsListQuery = z.object({
  tab: z.enum(["active", "archive", "all"]).default("all"),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type RequestsListQuery = z.output<typeof requestsListQuery>;

/** Параметр пути :id. Не UUID → 404 (как несуществующий), а не 422: не подсказываем формат. */
export const requestIdParams = z.object({ id: z.uuid() });

// ── DS-17. Создание, отмена, переписка, повторная подача ────────────────────

/** Значения полей формы (RequestCreateBody.fields): строка ≤ 2000 или число. */
const formFieldValue = z.union([z.string().trim().max(2000), z.number()]);

/** POST /api/me/requests — вход по formSchema типа валидирует сервис. */
export const requestCreateBody = z.object({
  typeCode: z.string().trim().min(1).max(60),
  delivery: z.enum(["electronic", "original"]).nullable(),
  copies: z.number().int().min(1).max(5),
  fields: z.record(z.string(), formFieldValue),
});
export type RequestCreateBody = z.output<typeof requestCreateBody>;

/** POST /api/me/requests/:id/messages — 1–2000 символов, trim. */
export const requestMessageBody = z.object({
  body: z.string().trim().min(1).max(2000),
});
export type RequestMessageBody = z.output<typeof requestMessageBody>;

/** POST /api/me/requests/:id/resubmit — перезапись полей поверх полей исходной заявки. */
export const requestResubmitBody = z.object({
  fields: z.record(z.string(), formFieldValue).optional(),
});
export type RequestResubmitBody = z.output<typeof requestResubmitBody>;

/** POST /api/me/data-fix — заявление на исправление личных данных (SPEC §6.1 п.12). */
export const dataFixBody = z.object({
  field: z.enum(["fullName", "group", "program", "contacts", "other"]),
  comment: z.string().trim().min(1).max(1000),
});
export type DataFixInput = z.output<typeof dataFixBody>;
