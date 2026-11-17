import type { SessionsDTO } from "@/contracts/api";
import { getSession, requireStudent } from "@/server/auth/guards";
import { ok, route } from "@/server/http";
import { listMySessions } from "@/server/services/sessions";

// Сеансы студента (SPEC §6.11 п.5, AC-11.2). Идентификатор — только из сессии.

/** GET /api/me/sessions → 200 SessionsDTO: активные сеансы, текущий помечен. */
export const GET = route(async (req) => {
  const me = await requireStudent(req);
  const current = (await getSession(req))?.session.id ?? "";
  return ok<SessionsDTO>(await listMySessions(me.userId, current));
});
