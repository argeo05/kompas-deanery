import type { Paged, RequestDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withIdempotency } from "@/server/idempotency";
import { withUserTx } from "@/server/db";
import { ok, parseJson, parseQuery, route } from "@/server/http";
import { requestCreateBody, requestsListQuery } from "@/server/schemas/requests";
import { createRequestForStudent, listMyRequests } from "@/server/services/requests";

// ЭТАЛОН эндпоинта студента (DEEPSEEK-TASKS §2). Копируйте структуру:
//   1) requireStudent — первая строка; id студента только из сессии;
//   2) вход — через Zod-схему из src/server/schemas (parseQuery / parseJson);
//   3) данные — сервис → репозиторий внутри withUserTx, с условием по владельцу;
//   4) ответ — ok() с типом из src/contracts/api.ts.
// Тесты: tests/integration/me-requests.test.ts; маршрут зарегистрирован в tests/security/manifest.ts.

/** GET /api/me/requests?tab=active|archive|all&cursor=&limit= → 200 Paged<RequestDTO> */
export const GET = route(async (req) => {
  const me = await requireStudent(req);
  const query = parseQuery(req, requestsListQuery);
  const page = await withUserTx(me.userId, (tx) => listMyRequests(tx, me.studentId, query));
  return ok<Paged<RequestDTO>>(page);
});

/** POST /api/me/requests — создание заявки (DS-17). Повтор гасится Idempotency-Key. */
export const POST = route(async (req) => {
  const me = await requireStudent(req);
  return withIdempotency(req, me.userId, async () => {
    const body = await parseJson(req, requestCreateBody);
    const request = await withUserTx(me.userId, (tx) =>
      createRequestForStudent(tx, me.studentId, body),
    );
    return ok<RequestDTO>(request, { status: 201 });
  });
});
