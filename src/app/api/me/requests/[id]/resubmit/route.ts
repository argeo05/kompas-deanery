import type { RequestDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { withIdempotency } from "@/server/idempotency";
import { notFound, ok, parseJson, route } from "@/server/http";
import { requestIdParams, requestResubmitBody } from "@/server/schemas/requests";
import { resubmitMyRequest } from "@/server/services/requests";

/**
 * POST /api/me/requests/:id/resubmit → 201 RequestDTO (SPEC §6.5 п.10).
 * Повторная подача после отказа: новая заявка с полями исходной (перезапись полями тела),
 * resubmittedFrom, свой Idempotency-Key, номер и срок. Только из rejected → иначе 409 CONFLICT.
 */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const me = await requireStudent(req);
  const parsed = requestIdParams.safeParse(await params);
  if (!parsed.success) notFound();
  return withIdempotency(req, me.userId, async () => {
    const body = await parseJson(req, requestResubmitBody);
    const request = await withUserTx(me.userId, (tx) =>
      resubmitMyRequest(tx, me.studentId, parsed.data.id, body.fields ?? {}),
    );
    if (!request) notFound();
    return ok<RequestDTO>(request, { status: 201 });
  });
});
