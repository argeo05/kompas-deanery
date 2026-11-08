import { z } from "zod";
import { HttpError } from "../http";

// Вход эндпоинтов расписания (DS-11). Схемы z.object отбрасывают лишние ключи —
// studentId/userId из query не доходят до кода.

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** GET /api/me/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD */
export const scheduleQuery = z.object({
  from: ISO_DATE.optional(),
  to: ISO_DATE.optional(),
});
export type ScheduleQuery = z.output<typeof scheduleQuery>;

/**
 * Диапазон дат: даты настоящие, from ≤ to, не больше 31 дня; по умолчанию — текущая неделя (пн–вс МСК).
 * Ошибка диапазона → 422 VALIDATION с путём поля.
 */
export function scheduleRange(
  q: ScheduleQuery,
  todayIso: string,
  weekday: number,
): { from: string; to: string } {
  const realIsoDate = (s: string): boolean => {
    const [y, m, d] = s.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  };
  const issues: Array<{ path: string; code: string }> = [];
  if (q.from && !realIsoDate(q.from)) issues.push({ path: "from", code: "invalid_date" });
  if (q.to && !realIsoDate(q.to)) issues.push({ path: "to", code: "invalid_date" });
  if (issues.length > 0) throw new HttpError(422, "VALIDATION", { issues });

  const mondayMs = new Date(`${todayIso}T00:00:00Z`).getTime() - (weekday - 1) * 24 * 3600_000;
  const from = q.from ?? new Date(mondayMs).toISOString().slice(0, 10);
  const to = q.to ?? new Date(mondayMs + 6 * 24 * 3600_000).toISOString().slice(0, 10);
  if (from > to) issues.push({ path: "from", code: "invalid_range" });
  if (
    new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime() >
    30 * 24 * 3600_000
  ) {
    issues.push({ path: "to", code: "range_too_long" });
  }
  if (issues.length > 0) throw new HttpError(422, "VALIDATION", { issues });
  return { from, to };
}

/** POST /api/me/schedule/changes/seen — тело { changeIds: UUID[] } (до 50). */
export const changesSeenBody = z.object({
  changeIds: z.array(z.uuid()).min(1).max(50),
});
export type ChangesSeenBody = z.output<typeof changesSeenBody>;

/** PUT /api/me/classes/:classId/note — тело { text } (0–500, пустая строка удаляет). */
export const classNoteBody = z.object({
  text: z.string().trim().max(500),
});
export type ClassNoteBody = z.output<typeof classNoteBody>;

/** Параметр пути PUT /api/me/classes/:classId/note. Кривой id — 404, как несуществующий. */
export const classIdParams = z.object({
  classId: z.uuid(),
});
export type ClassIdParams = z.output<typeof classIdParams>;
