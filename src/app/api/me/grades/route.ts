import type { GradesDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { ok, parseQuery, route } from "@/server/http";
import { gradesQuery } from "@/server/schemas/grades";
import { semesterGrades } from "@/server/services/grades";

// DS-12. Успеваемость семестра студента (SPEC §6.4). По образцу эталона src/app/api/me/requests/.

/** GET /api/me/grades?semester=2026-1 → 200 GradesDTO. Без semester — последний доступный семестр. */
export const GET = route(async (req) => {
  const me = await requireStudent(req);
  const query = parseQuery(req, gradesQuery);
  const dto = await withUserTx(me.userId, (tx) => semesterGrades(tx, me.studentId, query));
  return ok<GradesDTO>(dto);
});
