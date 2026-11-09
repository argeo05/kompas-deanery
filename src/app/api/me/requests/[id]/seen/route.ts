import { now } from "@/lib/clock";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { noContent, notFound, route } from "@/server/http";
import { markRequestSeen } from "@/server/repositories/requests";
import { requestIdParams } from "@/server/schemas/requests";

/**
 * POST /api/me/requests/:id/seen → 204. Карточку открыли: точка «новое» в списке гаснет (SPEC §6.5 п.4).
 * Отдельный запрос, а не побочный эффект GET: предзагрузка страницы не должна «прочитать» событие.
 */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const me = await requireStudent(req);
  const parsed = requestIdParams.safeParse(await params);
  if (!parsed.success) notFound();
  const rows = await withUserTx(me.userId, (tx) =>
    markRequestSeen(tx, me.studentId, parsed.data.id, now()),
  );
  if (rows.length === 0) notFound();
  return noContent();
});
