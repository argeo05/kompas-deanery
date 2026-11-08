import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { noContent, parseJson, route } from "@/server/http";
import { notificationsReadBody } from "@/server/schemas/notifications";
import { readMyNotifications } from "@/server/services/notifications";

/** POST /api/me/notifications/read — { ids: UUID[] } | { all: true } → 204 (DS-18). */
export const POST = route(async (req) => {
  const me = await requireStudent(req);
  const body = await parseJson(req, notificationsReadBody);
  await withUserTx(me.userId, (tx) => readMyNotifications(tx, me.userId, body));
  return noContent();
});
