import type { DeadlineDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { notFound, ok, route } from "@/server/http";
import { deadlineIdParams } from "@/server/schemas/deadlines";
import { changeMyDeadline } from "@/server/services/deadlines";

// Действия над дедлайном (DS-15). Чужой, несуществующий и «кривой» id — одинаково 404.

/** POST /api/me/deadlines/:id/unstar → 200 DeadlineDTO */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const me = await requireStudent(req);
  const parsed = deadlineIdParams.safeParse(await params);
  if (!parsed.success) notFound();
  const deadline = await withUserTx(me.userId, (tx) =>
    changeMyDeadline(tx, me.studentId, parsed.data.id, "unstar"),
  );
  if (!deadline) notFound();
  return ok<DeadlineDTO>(deadline);
});
