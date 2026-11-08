import type { StaffTicketRowDTO } from "@/contracts/api";
import { requireStaff } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { ok, parseQuery, route } from "@/server/http";
import { staffTicketsListQuery } from "@/server/schemas/staff-tickets";
import { listStaffTickets } from "@/server/services/staff-tickets";

// Обращения в деканат — сторона сотрудника (DS-33, SPEC §6.8.2). Область видимости —
// факультет сотрудника из requireStaff; общевузовское подразделение (facultyId null)
// видит все факультеты. Маршрут зарегистрирован в tests/security/manifest.ts как
// staff/pending — DS-33.

/** GET /api/staff/tickets?status=open|answered|closed → 200 { items: StaffTicketRowDTO[] } */
export const GET = route(async (req) => {
  const staff = await requireStaff(req);
  const query = parseQuery(req, staffTicketsListQuery);
  const list = await withUserTx(staff.userId, (tx) => listStaffTickets(tx, staff, query));
  return ok<{ items: StaffTicketRowDTO[] }>(list);
});
