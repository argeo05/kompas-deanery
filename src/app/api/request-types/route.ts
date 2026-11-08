import type { RequestTypesDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { ok, route } from "@/server/http";
import { listRequestTypes } from "@/server/services/request-types";

/** GET /api/request-types → 200 RequestTypesDTO (DS-16). Публичный для авторизованных студентов. */
export const GET = route(async (req) => {
  const me = await requireStudent(req);
  const catalog = await withUserTx(me.userId, (tx) => listRequestTypes(tx));
  return ok<RequestTypesDTO>(catalog);
});
