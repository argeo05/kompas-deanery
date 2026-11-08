import type { IcsUrlDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { ok, route } from "@/server/http";
import { getMyIcsUrl } from "@/server/services/ics";

// DS-22. Ссылка-подписка на календарь. Повторный GET возвращает ту же ссылку,
// пока студент её не сбросил (POST /api/me/ics/rotate). URL относительный: origin
// подставляет интерфейс (docs/ds-questions/DS-22.md, «решение по url»).

/** GET /api/me/ics → 200 IcsUrlDTO (idempotent, см. сервис). */
export const GET = route(async (req) => {
  const me = await requireStudent(req);
  return ok<IcsUrlDTO>(await withUserTx(me.userId, (tx) => getMyIcsUrl(tx, me.userId)));
});
