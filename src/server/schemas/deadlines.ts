import { z } from "zod";

// Вход эндпоинтов дедлайнов и планов (DS-15). Схемы z.object отбрасывают лишние ключи —
// studentId/userId из query и тела не доходят до кода.

/** GET /api/me/deadlines?status=active|done. Без параметра — все группы (hot/week/later/done). */
export const deadlinesListQuery = z.object({
  status: z.enum(["active", "done"]).optional(),
});
export type DeadlinesListQuery = z.output<typeof deadlinesListQuery>;

/** POST /api/me/deadlines — личный дедлайн { title (1–120), dueAt }. */
export const deadlineCreateBody = z.object({
  title: z.string().trim().min(1).max(120),
  dueAt: z.iso.datetime({ offset: true }),
});
export type DeadlineCreateBody = z.output<typeof deadlineCreateBody>;

/** Параметр пути :id. Не UUID → 404 (как несуществующий), а не 422. */
export const deadlineIdParams = z.object({ id: z.uuid() });

/** POST /api/me/plans — { deadlineId, startsAt, endsAt, place (1–60), firstAction (1–120) }. */
export const planCreateBody = z
  .object({
    deadlineId: z.uuid(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    place: z.string().trim().min(1).max(60),
    firstAction: z.string().trim().min(1).max(120),
  })
  .superRefine((v, ctx) => {
    if (new Date(v.endsAt).getTime() <= new Date(v.startsAt).getTime()) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "invalid_range" });
    }
  });
export type PlanCreateBody = z.output<typeof planCreateBody>;

/** Параметр пути :id у плана. */
export const planIdParams = z.object({ id: z.uuid() });
