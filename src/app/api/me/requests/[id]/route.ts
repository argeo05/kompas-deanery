import type { RequestDetailDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { notFound, ok, route } from "@/server/http";
import { requestIdParams } from "@/server/schemas/requests";
import { getMyRequest } from "@/server/services/requests";

// ЭТАЛОН карточки ресурса студента. Чужая, несуществующая и «кривой» id — одинаково 404 NOT_FOUND.

/** GET /api/me/requests/:id → 200 RequestDetailDTO */
export const GET = route<{ id: string }>(async (req, { params }) => {
  const me = await requireStudent(req);
  const parsed = requestIdParams.safeParse(await params);
  if (!parsed.success) notFound();
  const request = await withUserTx(me.userId, (tx) =>
    getMyRequest(tx, me.studentId, parsed.data.id),
  );
  if (!request) notFound();
  return ok<RequestDetailDTO>(request);
});
