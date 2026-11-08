import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { noContent, notFound, route } from "@/server/http";
import { planIdParams } from "@/server/schemas/deadlines";
import { deleteMyPlan } from "@/server/services/deadlines";

// Планы «если–то» (DS-15). Чужой, несуществующий и «кривой» id — одинаково 404.

/** DELETE /api/me/plans/:id → 204 */
export const DELETE = route<{ id: string }>(async (req, { params }) => {
  const me = await requireStudent(req);
  const parsed = planIdParams.safeParse(await params);
  if (!parsed.success) notFound();
  const deleted = await withUserTx(me.userId, (tx) =>
    deleteMyPlan(tx, me.studentId, parsed.data.id),
  );
  if (!deleted) notFound();
  return noContent();
});
