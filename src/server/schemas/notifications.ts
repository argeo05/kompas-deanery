import { z } from "zod";
import { HttpError } from "../http";
import type { NotificationCategory } from "@/contracts/api";

// Вход эндпоинтов уведомлений (GS-18). Схемы z.object отбрасывают лишние ключи.

const CATEGORIES: [NotificationCategory, ...NotificationCategory[]] = [
  "schedule",
  "request",
  "grade",
  "deadline",
  "announcement",
  "ticket",
  "plan",
];

/** GET /api/me/notifications?tab=&cursor=&limit= */
export const notificationsListQuery = z.object({
  tab: z.enum(["all", "important", "announcements"]).default("all"),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type NotificationsListQuery = z.output<typeof notificationsListQuery>;

/** POST /api/me/notifications/read — { ids: UUID[] } или { all: true }. */
export const notificationsReadBody = z.union([
  z.object({ ids: z.array(z.uuid()).min(1).max(100) }),
  z.object({ all: z.literal(true) }),
]);
export type NotificationsReadBody = z.output<typeof notificationsReadBody>;

const slot = z.coerce.number().int().min(0).max(1439);
const categoryEnum = z.enum(CATEGORIES);

/** PUT /api/me/notification-prefs: schedule и urgent выключить нельзя. */
export const notificationPrefsBody = z
  .object({
    slots: z.array(slot).min(1).max(4),
    preset: z.enum(["default", "evening", "custom"]).default("custom"),
    quietFrom: slot,
    quietTo: slot,
    immediateCategories: z.array(categoryEnum).max(7).default([]),
    disabledCategories: z.array(categoryEnum).max(7).default([]),
  })
  .superRefine((v, ctx) => {
    // слоты по возрастанию без дублей
    for (let i = 1; i < v.slots.length; i++) {
      if (v.slots[i]! <= v.slots[i - 1]!) {
        ctx.addIssue({ code: "custom", path: ["slots"], message: "slots_ascending" });
        break;
      }
    }
    if (v.immediateCategories.includes("schedule")) {
      ctx.addIssue({
        code: "custom",
        path: ["immediateCategories"],
        message: "schedule_immutable",
      });
    }
    if (v.disabledCategories.includes("schedule")) {
      ctx.addIssue({ code: "custom", path: ["disabledCategories"], message: "schedule_immutable" });
    }
  });
export type NotificationPrefsBody = z.output<typeof notificationPrefsBody>;

/** Код ошибки для «нельзя выключить» — машиновый code, без человеческих текстов (§3). */
export function prefsForbidden(
  category: string,
  field: "immediateCategories" | "disabledCategories",
): never {
  throw new HttpError(422, "VALIDATION", {
    issues: [{ path: field, code: `cannot_disable_${category}` }],
  });
}
