import type { StaffRequestDTO, UUID } from "@/contracts/api";
import { requireStaff } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { notFound, ok, parseJson, route } from "@/server/http";
import { staffRequestIdParams, staffTransitionBody } from "@/server/schemas/staff-requests";
import { transitionStaffRequest } from "@/server/services/staff-requests";

// Действие сотрудника над заявкой (DS-30): take / need_info / ready / issue / reject.
// Переходы проверяет FSM (src/lib/request-fsm.ts), недопустимый — 409 CONFLICT;
// need_info требует comment, reject — rejectReason и comment (иначе 422).
// Для ready электронных документов PDF соберёт issueDocument в фазе C (TODO в сервисе):
// уведомление студенту и события при этом те же.

/** POST /api/staff/requests/:id/transition → 200 StaffRequestDTO */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const staff = await requireStaff(req);
  const parsedId = staffRequestIdParams.safeParse(await params);
  if (!parsedId.success) notFound();
  const body = await parseJson(req, staffTransitionBody);
  const dto = await withUserTx(staff.userId, (tx) =>
    transitionStaffRequest(tx, staff, parsedId.data.id as UUID, body),
  );
  if (!dto) notFound();
  return ok<StaffRequestDTO>(dto);
});
