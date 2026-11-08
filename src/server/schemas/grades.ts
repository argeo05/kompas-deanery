import { z } from "zod";

// Вход эндпоинтов успеваемости (DS-12, DS-13). Схемы z.object отбрасывают лишние ключи —
// studentId/userId из query не доходят до кода (идентификаторы только из сессии).

const SEMESTER_FORMAT = /^\d{4}-\d{1,2}$/;

/** GET /api/me/grades?semester=2026-1 — без параметра берём последний доступный семестр студента. */
export const gradesQuery = z.object({
  semester: z.string().trim().regex(SEMESTER_FORMAT, "invalid_semester").optional(),
});
export type GradesQuery = z.output<typeof gradesQuery>;

/** Параметр пути :courseId. Не UUID → 404 (как несуществующий), а не 422: не подсказываем формат. */
export const courseIdParams = z.object({ courseId: z.uuid() });
