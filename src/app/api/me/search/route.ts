import type { SearchDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { ok, parseQuery, route } from "@/server/http";
import { searchQuery } from "@/server/schemas/search";
import { searchMine } from "@/server/services/search";

// Поиск по кабинету (SPEC §6.10). Студент ищет только по доступным ему объектам.

/** GET /api/me/search?q= → 200 SearchDTO */
export const GET = route(async (req) => {
  const me = await requireStudent(req);
  const { q } = parseQuery(req, searchQuery);
  return ok<SearchDTO>(await withUserTx(me.userId, (tx) => searchMine(tx, me, q)));
});
