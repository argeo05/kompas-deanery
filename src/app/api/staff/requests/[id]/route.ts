import type { UUID, StaffRequestDTO } from "@/contracts/api";
import { requireStaff } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { notFound, ok, route } from "@/server/http";
import { staffRequestIdParams } from "@/server/schemas/staff-requests";
import { getStaffRequest } from "@/server/services/staff-requests";

// Карточка заявки для сотрудника (DS-30). Данные студента — только ФИО, группа, программа,
// курс: без оценок и без контактов (SPEC §6.9). Чужой факультет, несуществующий и «кривой»
// id — одинаково 404 NOT_FOUND.

/** GET /api/staff/requests/:id → 200 StaffRequestDTO */
export const GET = route<{ id: string }>(async (req, { params }) => {
  const staff = await requireStaff(req);
  const parsed = staffRequestIdParams.safeParse(await params);
  if (!parsed.success) notFound();
  const dto = await withUserTx(staff.userId, (tx) =>
    getStaffRequest(tx, staff, parsed.data.id as UUID),
  );
  if (!dto) notFound();
  return ok<StaffRequestDTO>(dto);
});
