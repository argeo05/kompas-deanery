import type { TicketDetailDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { notFound, ok, route } from "@/server/http";
import { ticketIdParams } from "@/server/schemas/tickets";
import { getMyTicketDetail } from "@/server/services/tickets";

// Карточка обращения (DS-21). Чужое, несуществующее и «кривой» id — одинаково 404 NOT_FOUND.
// Открытие карточки помечает переписку прочитанной (studentSeenAt — непрочитанное по списку).

/** GET /api/me/tickets/:id → 200 TicketDetailDTO */
export const GET = route<{ id: string }>(async (req, { params }) => {
  const me = await requireStudent(req);
  const parsed = ticketIdParams.safeParse(await params);
  if (!parsed.success) notFound();
  const ticket = await withUserTx(me.userId, (tx) =>
    getMyTicketDetail(tx, me.studentId, parsed.data.id),
  );
  if (!ticket) notFound();
  return ok<TicketDetailDTO>(ticket);
});
