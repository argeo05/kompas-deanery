import type { SessionDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { ok, route } from "@/server/http";
import { getMySession } from "@/server/services/session";

// DS-14. Экзамены — общие таблицы по группе, admissions — личная: поэтому весь
// запрос внутри withUserTx, допуск читается с условием по владельцу.

/** GET /api/me/session → 200 SessionDTO (порядок по startsAt). */
export const GET = route(async (req) => {
  const me = await requireStudent(req);
  const session = await withUserTx(me.userId, (tx) => getMySession(tx, me.studentId, me.groupId));
  return ok<SessionDTO>(session);
});
