import type { DeadlinesDTO, DeadlineDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { ok, parseJson, parseQuery, route } from "@/server/http";
import { deadlineCreateBody, deadlinesListQuery } from "@/server/schemas/deadlines";
import { createMyDeadline, listMyDeadlines } from "@/server/services/deadlines";

// Дедлайны студента (DS-15). Образец — эталон src/app/api/me/requests/.

/** GET /api/me/deadlines?status=active|done → 200 DeadlinesDTO */
export const GET = route(async (req) => {
  const me = await requireStudent(req);
  const query = parseQuery(req, deadlinesListQuery);
  const groups = await withUserTx(me.userId, (tx) => listMyDeadlines(tx, me.studentId, query));
  return ok<DeadlinesDTO>(groups);
});

/** POST /api/me/deadlines { title, dueAt } → 201 DeadlineDTO */
export const POST = route(async (req) => {
  const me = await requireStudent(req);
  const body = await parseJson(req, deadlineCreateBody);
  const deadline = await withUserTx(me.userId, (tx) => createMyDeadline(tx, me.studentId, body));
  return ok<DeadlineDTO>(deadline, { status: 201 });
});
