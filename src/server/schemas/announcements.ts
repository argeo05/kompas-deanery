import { z } from "zod";
import type { AnnouncementAudience } from "@/contracts/api";

// Вход эндпоинтов объявлений (DS-31, SPEC §6.9). Схемы z.object отбрасывают лишние ключи —
// userId/studentId из query и тела не доходят до кода. Машинный вход; тексты полей пишет Claude.

/** GET /api/staff/announcements и GET /api/me/announcements: ?cursor=&limit=. */
export const announcementsListQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type AnnouncementsListQuery = z.output<typeof announcementsListQuery>;

/** Параметр пути :id архива. Не UUID → 404 (как несуществующий), а не 422. */
export const announcementIdParams = z.object({ id: z.uuid() });

/**
 * Аудитория по контракту AnnouncementAudience: желаемые критерии, каждый — непустой список.
 * `courses` — номера курса обучения (числа 1–6), не id дисциплин: контракт объявляет их числами.
 * Хотя бы один непустой критерий проверяет superRefine; принадлежность факультету — сервис.
 */
const audienceSchema = z
  .object({
    facultyIds: z.array(z.uuid()).min(1).max(50).optional(),
    courses: z.array(z.number().int().min(1).max(6)).min(1).max(6).optional(),
    groupIds: z.array(z.uuid()).min(1).max(50).optional(),
  })
  .superRefine((aud, ctx) => {
    const any =
      (aud.facultyIds?.length ?? 0) > 0 ||
      (aud.courses?.length ?? 0) > 0 ||
      (aud.groupIds?.length ?? 0) > 0;
    if (!any) {
      // путь=[]: superRefine уже вложен в объекте `audience` — полный путь станет "audience"
      ctx.addIssue({ code: "custom", path: [], message: "audience_empty" });
    }
  });

/** POST /api/staff/announcements. Границы интервала publishAt/expiresAt проверяет сервис. */
export const announcementCreateBody = z.object({
  title: z.string().trim().min(1).max(120),
  bodyMd: z.string().trim().min(1).max(5000),
  audience: audienceSchema,
  important: z.boolean(),
  publishAt: z.iso.datetime({ offset: true }).optional(),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});
export type AnnouncementCreateInput = z.output<typeof announcementCreateBody>;

/** Как аудиторию сохраняют в jsonb (для DTO и notify): undefined-ключи убраны —
 * SQL смотрит их отсутствие через `? 'ключ'`, а не через NULL-значение. */
export function toAudience(input: AnnouncementCreateInput): AnnouncementAudience {
  return {
    ...(input.audience.facultyIds ? { facultyIds: input.audience.facultyIds } : {}),
    ...(input.audience.courses ? { courses: input.audience.courses } : {}),
    ...(input.audience.groupIds ? { groupIds: input.audience.groupIds } : {}),
  };
}
