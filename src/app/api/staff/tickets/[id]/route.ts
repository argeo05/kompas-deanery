import type { StaffTicketDetailDTO } from "@/contracts/api";
import { requireStaff } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { notFound, ok, route } from "@/server/http";
import { staffTicketIdParams } from "@/server/schemas/staff-tickets";
import { getStaffTicket } from "@/server/services/staff-tickets";

// Карточка обращения сотрудника (DS-33): переписка и данные студента (только ФИО и группа).
// Чужой факультет, несуществующий и «кривой» id — одинаково 404 NOT_FOUND.

/** GET /api/staff/tickets/:id → 200 StaffTicketDetailDTO */
export const GET = route<{ id: string }>(async (req, { params }) => {
  const staff = await requireStaff(req);
  const parsedId = staffTicketIdParams.safeParse(await params);
  if (!parsedId.success) notFound();
  const detail = await withUserTx(staff.userId, (tx) =>
    getStaffTicket(tx, staff, parsedId.data.id),
  );
  if (!detail) notFound();
  return ok<StaffTicketDetailDTO>(detail);
});
