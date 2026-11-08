import type { RequestDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { ok, parseJson, route } from "@/server/http";
import { dataFixBody } from "@/server/schemas/requests";
import { createDataFixRequest } from "@/server/services/requests";

/**
 * POST /api/me/data-fix → 201 RequestDTO (SPEC §6.1 п.12).
 * Заявка типа data_fix: delivery null, copies 1, payload { field, comment }, срок по SLA каталога.
 * Считается в общий лимит создания заявок (10/ч) вместе с POST /api/me/requests.
 */
export const POST = route(async (req) => {
  const me = await requireStudent(req);
  const body = await parseJson(req, dataFixBody);
  const request = await withUserTx(me.userId, (tx) => createDataFixRequest(tx, me.studentId, body));
  return ok<RequestDTO>(request, { status: 201 });
});
