import { requireStudent } from "@/server/auth/guards";
import { noContent, route } from "@/server/http";
import { endAllMySessions } from "@/server/services/sessions";

/** POST /api/me/sessions/revoke-all → 204. «Выйти на всех устройствах»: удаляются все сеансы, включая этот (AC-11.2). */
export const POST = route(async (req) => {
  const me = await requireStudent(req);
  await endAllMySessions(me.userId);
  return noContent();
});
