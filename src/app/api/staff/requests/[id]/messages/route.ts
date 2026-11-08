import type { UUID, MessageDTO } from "@/contracts/api";
import { requireStaff } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { notFound, ok, parseJson, route } from "@/server/http";
import { staffRequestIdParams, staffRequestMessageBody } from "@/server/schemas/staff-requests";
import { addStaffMessage } from "@/server/services/staff-requests";

// Сообщение сотрудника в переписке по заявке (DS-30). Статус заявки не меняется
// (в том числе needs_info — ждём ответа студента), у завершённых заявок переписка закрыта → 409.

/** POST /api/staff/requests/:id/messages → 201 MessageDTO */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const staff = await requireStaff(req);
  const parsedId = staffRequestIdParams.safeParse(await params);
  if (!parsedId.success) notFound();
  const body = await parseJson(req, staffRequestMessageBody);
  const message = await withUserTx(staff.userId, (tx) =>
    addStaffMessage(tx, staff, parsedId.data.id as UUID, body),
  );
  if (!message) notFound();
  return ok<MessageDTO>(message, { status: 201 });
});
