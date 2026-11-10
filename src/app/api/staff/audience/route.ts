import type { AudienceCountDTO } from "@/contracts/api";
import { requireStaff } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { ok, parseQuery, route } from "@/server/http";
import { audienceCountQuery } from "@/server/schemas/announcements";
import { countAudience } from "@/server/services/staff-reference";

// Сколько студентов увидят объявление при выбранной аудитории (предпросмотр в форме, SPEC §6.9).
// Считает тем же отбором, что и публикация, и только в пределах факультета сотрудника.
// Маршрут зарегистрирован в tests/security/manifest.ts (C6).

/** GET /api/staff/audience?facultyIds=a,b&groupIds=c&courses=1,2 → 200 AudienceCountDTO */
export const GET = route(async (req) => {
  const staff = await requireStaff(req);
  const query = parseQuery(req, audienceCountQuery);
  const dto = await withUserTx(staff.userId, (tx) =>
    countAudience(tx, staff, {
      ...(query.facultyIds.length ? { facultyIds: query.facultyIds } : {}),
      ...(query.groupIds.length ? { groupIds: query.groupIds } : {}),
      ...(query.courses.length ? { courses: query.courses } : {}),
    }),
  );
  return ok<AudienceCountDTO>(dto);
});
