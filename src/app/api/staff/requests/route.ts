import type { StaffRequestsDTO } from "@/contracts/api";
import { requireStaff } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { ok, parseQuery, route } from "@/server/http";
import { staffRequestsListQuery } from "@/server/schemas/staff-requests";
import { listStaffRequests } from "@/server/services/staff-requests";

// Очередь заявок для кабинета сотрудника (DS-30). Область видимости — факультет сотрудника
// из requireStaff; общевузовское подразделение (facultyId null) видит все факультеты.
// Маршрут зарегистрирован в tests/security/manifest.ts как staff/pending — DS-30.

/** GET /api/staff/requests?status=&type=&overdue=true&mine=true&cursor=&sort=&limit= → 200 StaffRequestsDTO */
export const GET = route(async (req) => {
  const staff = await requireStaff(req);
  const query = parseQuery(req, staffRequestsListQuery);
  const page = await withUserTx(staff.userId, (tx) => listStaffRequests(tx, staff, query));
  return ok<StaffRequestsDTO>(page);
});
