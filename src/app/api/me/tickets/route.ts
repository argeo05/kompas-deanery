import type { TicketDTO, TicketsDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { withIdempotency } from "@/server/idempotency";
import { ok, parseJson, route } from "@/server/http";
import { ticketCreateBody } from "@/server/schemas/tickets";
import { createMyTicket, listMyTickets } from "@/server/services/tickets";

// Обращения в деканат — сторона студента (DS-21, SPEC §6.8.1). Образец — эталон me/requests.
// Список и создание; карточка и переписка — в [id]/route.ts и [id]/messages/route.ts.

/** GET /api/me/tickets → 200 TicketsDTO — обращения студента, свежие первыми. */
export const GET = route(async (req) => {
  const me = await requireStudent(req);
  const list = await withUserTx(me.userId, (tx) => listMyTickets(tx, me.studentId));
  return ok<TicketsDTO>(list);
});

/** POST /api/me/tickets → 201 TicketDTO. Заголовок Idempotency-Key обязателен (§2, AC-5.4). */
export const POST = route(async (req) => {
  const me = await requireStudent(req);
  // parseJson внутри fn: withIdempotency первым делом читает тело через req.clone().
  return withIdempotency(req, me.userId, async () => {
    const body = await parseJson(req, ticketCreateBody);
    const ticket = await withUserTx(me.userId, (tx) => createMyTicket(tx, me, body));
    return ok<TicketDTO>(ticket, { status: 201 });
  });
});
