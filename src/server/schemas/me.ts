import { z } from "zod";

// Вход эндпоинтов профиля студента. Схемы z.object отбрасывают лишние ключи —
// studentId/userId и прочие поля из тела игнорируются.

/** PATCH /api/me — разрешено менять только displayName и onboardingDone (DS-10). */
export const mePatchBody = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  onboardingDone: z.boolean().optional(),
});
export type MePatchBody = z.output<typeof mePatchBody>;
