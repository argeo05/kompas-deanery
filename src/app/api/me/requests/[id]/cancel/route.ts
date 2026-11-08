import type { RequestDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { notFound, ok, route } from "@/server/http";
import { requestIdParams } from "@/server/schemas/requests";
import { cancelMyRequest } from "@/server/services/requests";

/**
 * POST /api/me/requests/:id/cancel → 200 RequestDTO.
 * FSM (DS-06): отменить может только студент и только из submitted; недопустимый
 * переход — 409 CONFLICT. Чужая/несуществующая заявка — тот же 404, как у эталона.
 */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const me = await requireStudent(req);
  const parsed = requestIdParams.safeParse(await params);
  if (!parsed.success) notFound();
  const request = await withUserTx(me.userId, (tx) =>
    cancelMyRequest(tx, me.studentId, parsed.data.id),
  );
  if (!request) notFound();
  return ok<RequestDTO>(request);
});
