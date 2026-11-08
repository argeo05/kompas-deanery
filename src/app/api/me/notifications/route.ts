import type { NotificationsDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { ok, parseQuery, route } from "@/server/http";
import { notificationsListQuery } from "@/server/schemas/notifications";
import { listMyNotifications } from "@/server/services/notifications";

/** GET /api/me/notifications?tab=all|important|announcements&cursor=&limit= → 200 (DS-18). */
export const GET = route(async (req) => {
  const me = await requireStudent(req);
  const q = parseQuery(req, notificationsListQuery);
  const page = await withUserTx(me.userId, (tx) => listMyNotifications(tx, me.userId, q));
  return ok<NotificationsDTO>(page);
});
