import type { StaffReferenceDTO } from "@/contracts/api";
import { requireStaff } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { ok, route } from "@/server/http";
import { getStaffReference } from "@/server/services/staff-reference";

// Справочники для форм кабинета сотрудника (C6, SPEC §6.9): группы и факультеты в пределах
// факультета сотрудника, аудитории, преподаватели, типы заявок, подпись самого сотрудника.
// Маршрут зарегистрирован в tests/security/manifest.ts (C6).

/** GET /api/staff/reference → 200 StaffReferenceDTO */
export const GET = route(async (req) => {
  const staff = await requireStaff(req);
  const dto = await withUserTx(staff.userId, (tx) => getStaffReference(tx, staff));
  return ok<StaffReferenceDTO>(dto);
});
