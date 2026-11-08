import type { PlanDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { ok, parseJson, route } from "@/server/http";
import { planCreateBody } from "@/server/schemas/deadlines";
import { createMyPlan } from "@/server/services/deadlines";

// Планы «если–то» (DS-15, SPEC §6.7). Пересечение окна с парами не проверяем — это дело UI.

/** POST /api/me/plans { deadlineId, startsAt, endsAt, place, firstAction } → 201 PlanDTO */
export const POST = route(async (req) => {
  const me = await requireStudent(req);
  const body = await parseJson(req, planCreateBody);
  const plan = await withUserTx(me.userId, (tx) =>
    createMyPlan(tx, { studentId: me.studentId, groupId: me.groupId }, body),
  );
  return ok<PlanDTO>(plan, { status: 201 });
});
