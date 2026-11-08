import type { DeadlineWindowsDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { notFound, ok, route } from "@/server/http";
import { deadlineIdParams } from "@/server/schemas/deadlines";
import { findMyDeadlineWindows } from "@/server/services/deadlines";

// Свободные окна «Когда займусь?» (DS-15, DS-05). Чужой или несуществующий дедлайн — 404.

/** GET /api/me/deadlines/:id/windows → 200 DeadlineWindowsDTO */
export const GET = route<{ id: string }>(async (req, { params }) => {
  const me = await requireStudent(req);
  const parsed = deadlineIdParams.safeParse(await params);
  if (!parsed.success) notFound();
  const windows = await withUserTx(me.userId, (tx) =>
    findMyDeadlineWindows(tx, { studentId: me.studentId, groupId: me.groupId }, parsed.data.id),
  );
  if (!windows) notFound();
  return ok<DeadlineWindowsDTO>(windows);
});
