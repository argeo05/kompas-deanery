import type { NotificationPrefsDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { ok, parseJson, route } from "@/server/http";
import { notificationPrefsBody } from "@/server/schemas/notifications";
import { getMyPrefsDTO, saveMyPrefsDTO } from "@/server/services/notifications";

/** GET /api/me/notification-prefs → 200 NotificationPrefsDTO (DS-18). */
export const GET = route(async (req) => {
  const me = await requireStudent(req);
  const prefs = await withUserTx(me.userId, (tx) => getMyPrefsDTO(tx, me.userId));
  return ok<NotificationPrefsDTO>(prefs);
});

/** PUT /api/me/notification-prefs → 200 NotificationPrefsDTO. schedule выключить нельзя (422). */
export const PUT = route(async (req) => {
  const me = await requireStudent(req);
  const body = await parseJson(req, notificationPrefsBody);
  const prefs = await withUserTx(me.userId, (tx) => saveMyPrefsDTO(tx, me.userId, body));
  return ok<NotificationPrefsDTO>(prefs);
});
