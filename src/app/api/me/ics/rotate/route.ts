import type { IcsUrlDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { ok, route } from "@/server/http";
import { rotateIcsUrl } from "@/server/services/ics";

// DS-22. «Сбросить ссылку»: новый токен, старый перестаёт работать (SPEC §6.9).
// Каждый вызов выдаёт НОВЫЙ токен — withIdempotency здесь не нужен (см. сервис).

/** POST /api/me/ics/rotate → 200 IcsUrlDTO. */
export const POST = route(async (req) => {
  const me = await requireStudent(req);
  return ok<IcsUrlDTO>(await withUserTx(me.userId, (tx) => rotateIcsUrl(tx, me.userId)));
});
