import type { MessageDTO } from "@/contracts/api";
import { requireStaff } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { notFound, ok, parseJson, route } from "@/server/http";
import { staffTicketIdParams, staffTicketMessageBody } from "@/server/schemas/staff-tickets";
import { addStaffTicketMessage } from "@/server/services/staff-tickets";

// Ответ сотрудника в переписке по обращению (DS-33). Статус обращения → answered,
// студент получает уведомление (см. сервис). В закрытое обращение писать нельзя — 409.

/** POST /api/staff/tickets/:id/messages → 201 MessageDTO */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const staff = await requireStaff(req);
  const parsedId = staffTicketIdParams.safeParse(await params);
  if (!parsedId.success) notFound();
  const body = await parseJson(req, staffTicketMessageBody);
  const message = await withUserTx(staff.userId, (tx) =>
    addStaffTicketMessage(tx, staff, parsedId.data.id, body),
  );
  if (!message) notFound();
  return ok<MessageDTO>(message, { status: 201 });
});
