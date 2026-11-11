import type { RequestMessageCreatedDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { notFound, ok, parseJson, route } from "@/server/http";
import { withIdempotency } from "@/server/idempotency";
import { requestIdParams, requestMessageBody } from "@/server/schemas/requests";
import { addRequestMessageForStudent } from "@/server/services/requests";

/**
 * POST /api/me/requests/:id/messages — тело { body: 1–2000, trim }.
 * Если заявка в needs_info — переход student_reply → in_progress и событие (FSM DS-06);
 * сотрудникам notify не нужен. → 201 { message: MessageDTO; request: RequestDTO }.
 *
 * Idempotency-Key необязателен: с ним (офлайн-очередь, SPEC §6.13 п.4) повтор после обрыва
 * возвращает тот же ответ и не создаёт второе сообщение. Без ключа — как раньше.
 */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const me = await requireStudent(req);
  const parsed = requestIdParams.safeParse(await params);
  if (!parsed.success) notFound();
  const id = parsed.data.id;
  const create = async () => {
    const body = await parseJson(req, requestMessageBody);
    const result = await withUserTx(me.userId, (tx) =>
      addRequestMessageForStudent(tx, me.studentId, me.userId, id, body),
    );
    if (!result) notFound();
    return ok<RequestMessageCreatedDTO>(result, { status: 201 });
  };
  return req.headers.has("idempotency-key") ? withIdempotency(req, me.userId, create) : create();
});
