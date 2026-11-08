import type { MessageDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { notFound, ok, parseJson, route } from "@/server/http";
import { ticketIdParams, ticketMessageBody } from "@/server/schemas/tickets";
import { addMyTicketMessage } from "@/server/services/tickets";

// Сообщение студента в обращении (DS-21). Обновляет lastMessageAt; статус студент не меняет.
// В закрытое обращение писать нельзя (409 CONFLICT), чужое — 404.

/** POST /api/me/tickets/:id/messages → 201 MessageDTO */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const me = await requireStudent(req);
  const parsed = ticketIdParams.safeParse(await params);
  if (!parsed.success) notFound();
  const body = await parseJson(req, ticketMessageBody);
  const message = await withUserTx(me.userId, (tx) =>
    addMyTicketMessage(tx, me, parsed.data.id, body),
  );
  if (!message) notFound();
  return ok<MessageDTO>(message, { status: 201 });
});
