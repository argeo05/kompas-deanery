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
