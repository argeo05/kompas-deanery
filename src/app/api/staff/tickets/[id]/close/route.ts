import type { StaffTicketRowDTO } from "@/contracts/api";
import { requireStaff } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { notFound, ok, route } from "@/server/http";
import { staffTicketIdParams } from "@/server/schemas/staff-tickets";
import { closeStaffTicket } from "@/server/services/staff-tickets";

// Закрытие обращения сотрудником (DS-33): переписка становится недоступной для обеих
// сторон (у студента — 409, DS-21). Повторное закрытие — 409 CONFLICT; чужой факультет,
// несуществующий и «кривой» id — одинаково 404.

/** POST /api/staff/tickets/:id/close → 200 StaffTicketRowDTO */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const staff = await requireStaff(req);
  const parsedId = staffTicketIdParams.safeParse(await params);
  if (!parsedId.success) notFound();
  const dto = await withUserTx(staff.userId, (tx) => closeStaffTicket(tx, staff, parsedId.data.id));
  if (!dto) notFound();
  return ok<StaffTicketRowDTO>(dto);
});
