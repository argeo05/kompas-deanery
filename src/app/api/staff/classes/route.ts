import type { StaffClassesDTO } from "@/contracts/api";
import { requireStaff } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { ok, parseQuery, route } from "@/server/http";
import { staffClassesQuery } from "@/server/schemas/schedule-staff";
import { listStaffClassesForDay } from "@/server/services/schedule-staff";

// Пары дня для кабинета сотрудника (DS-32, SPEC §6.3). Видимость — по факультету из
// requireStaff (null — общевузовское подразделение, видит все факультеты); пары другой
// группы просто не попадают в список (чужое = 404 — только для конкретной пары).
// Маршрут зарегистрирован в tests/security/manifest.ts (DS-32).

/** GET /api/staff/classes?date=YYYY-MM-DD&groupId= → 200 StaffClassesDTO */
export const GET = route(async (req) => {
  const staff = await requireStaff(req);
  const query = parseQuery(req, staffClassesQuery);
  const dto = await withUserTx(staff.userId, (tx) => listStaffClassesForDay(tx, staff, query));
  return ok<StaffClassesDTO>(dto);
});
