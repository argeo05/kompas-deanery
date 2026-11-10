import type { KbListDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { ok, route } from "@/server/http";
import { listKb } from "@/server/services/kb";

/** GET /api/me/kb → 200 KbListDTO */
export const GET = route(async (req) => {
  const me = await requireStudent(req);
  return ok<KbListDTO>(await withUserTx(me.userId, (tx) => listKb(tx)));
});
