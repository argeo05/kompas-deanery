import { z } from "zod";
import type { TicketTopic } from "@/contracts/api";

// Вход эндпоинтов обращений (DS-21). Схемы z.object отбрасывают лишние ключи —
// studentId/userId из тела игнорируются (ids берутся только из сессии).

const TOPICS: [TicketTopic, ...TicketTopic[]] = [
  "schedule",
  "grades",
  "requests",
  "dorm",
  "scholarship",
  "other",
];

/** POST /api/me/tickets — тема, текст 1–2000, необязательная ссылка на объект (SPEC §6.8 п.1). */
export const ticketCreateBody = z.object({
  topic: z.enum(TOPICS),
  body: z.string().trim().min(1).max(2000),
  link: z
    .object({
      kind: z.enum(["class", "request", "course"]),
      id: z.uuid(),
    })
    .optional(),
});
export type TicketCreateInput = z.output<typeof ticketCreateBody>;

/** POST /api/me/tickets/:id/messages. */
export const ticketMessageBody = z.object({
  body: z.string().trim().min(1).max(2000),
});
export type TicketMessageInput = z.output<typeof ticketMessageBody>;

/** Параметр пути обращения. Кривой id — 404 (как несуществующий), а не 422. */
export const ticketIdParams = z.object({ id: z.uuid() });
export type TicketIdParams = z.output<typeof ticketIdParams>;
