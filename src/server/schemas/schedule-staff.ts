import { z } from "zod";

// Вход эндпоинтов расписания сотрудника (DS-32). Схемы z.object отбрасывают лишние ключи —
// userId/studentId из query и тела не доходят до кода. Машинный вход.

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const realIsoDate = (s: string): boolean => {
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

/**
 * GET /api/staff/classes?date=YYYY-MM-DD&groupId= — дата обязательна (план матрицы изоляции
 * идёт по конкретному дню), groupId — опциональный фильтр группы.
 */
export const staffClassesQuery = z
  .object({
    date: ISO_DATE,
    groupId: z.uuid().optional(),
  })
  .superRefine((v, ctx) => {
    if (!realIsoDate(v.date)) {
      ctx.addIssue({ code: "custom", path: ["date"], message: "invalid_date" });
    }
  });
export type StaffClassesQuery = z.output<typeof staffClassesQuery>;

/** Параметр пути POST /api/staff/classes/:id/changes. Кривой id — 404, как несуществующий. */
export const staffClassIdParams = z.object({ id: z.uuid() });
export type StaffClassIdParams = z.output<typeof staffClassIdParams>;

/**
 * POST /api/staff/classes/:id/changes (DS-32). Требования полей по типу проверяет схема —
 * moved требует newStartsAt + newEndsAt (newEndsAt > newStartsAt), room_changed — newRoomId,
 * teacher_changed — newTeacherId; cancelled — без полей.
 */
export const scheduleChangeCreateBody = z
  .object({
    type: z.enum(["cancelled", "moved", "room_changed", "teacher_changed"]),
    newStartsAt: z.iso.datetime({ offset: true }).optional(),
    newEndsAt: z.iso.datetime({ offset: true }).optional(),
    newRoomId: z.uuid().optional(),
    newTeacherId: z.uuid().optional(),
    reason: z.string().trim().max(200).optional(),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (v.type === "moved") {
      if (!v.newStartsAt) issue("newStartsAt", "required");
      if (!v.newEndsAt) issue("newEndsAt", "required");
      if (
        v.newStartsAt &&
        v.newEndsAt &&
        new Date(v.newEndsAt).getTime() <= new Date(v.newStartsAt).getTime()
      ) {
        issue("newEndsAt", "invalid_range");
      }
    }
    if (v.type === "room_changed" && !v.newRoomId) issue("newRoomId", "required");
    if (v.type === "teacher_changed" && !v.newTeacherId) issue("newTeacherId", "required");
  });
export type ScheduleChangeInput = z.output<typeof scheduleChangeCreateBody>;
