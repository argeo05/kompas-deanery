import { z } from "zod";

// Вход эндпоинтов обращений для роли staff (DS-33, SPEC §6.8.2). Схемы z.object отбрасывают
// лишние ключи — studentId/userId из query и тела игнорируются (ids только из сессии).

const STATUSES = ["open", "answered", "closed"] as const;

/** GET /api/staff/tickets?status=open|answered|closed (опционально). */
export const staffTicketsListQuery = z.object({
  status: z.enum(STATUSES).optional(),
});
export type StaffTicketsListQuery = z.output<typeof staffTicketsListQuery>;

/** Параметр пути обращения. «Кривой» id — 404 (как несуществующий), а не 422. */
export const staffTicketIdParams = z.object({ id: z.uuid() });
export type StaffTicketIdParams = z.output<typeof staffTicketIdParams>;

/** POST /api/staff/tickets/:id/messages — текст ответа: 1–2000 символов, trim (§3 п.5). */
export const staffTicketMessageBody = z.object({
  body: z.string().trim().min(1).max(2000),
});
export type StaffTicketMessageInput = z.output<typeof staffTicketMessageBody>;
