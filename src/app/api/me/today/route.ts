import type { TodayDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { ok, route } from "@/server/http";
import { getMyToday } from "@/server/services/today";

// Агрегат главной «Сегодня» (DS-20, SPEC §6.2): hero, пары дня, «важное» и новости
// — всё в одном ответе, без N+1 (p95 ≤ 300 мс на сиде).
// Маршрут зарегистрирован в tests/security/manifest.ts (pending — снимает Claude).

/** GET /api/me/today → 200 TodayDTO */
export const GET = route(async (req) => {
  const me = await requireStudent(req);
  const today = await withUserTx(me.userId, (tx) => getMyToday(tx, me));
  return ok<TodayDTO>(today);
});
