import type { ScheduleDTO } from "@/contracts/api";
import { now } from "@/lib/clock";
import { mskParts, toMskDate } from "@/lib/time";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { ok, parseQuery, route } from "@/server/http";
import { getMySchedule } from "@/server/services/schedule";
import { scheduleQuery, scheduleRange } from "@/server/schemas/schedule";

// Расписание студента (DS-11): пары группы + личные курсы из enrollments, изменения применены.
// Структура — копия эталона src/app/api/me/requests/route.ts.
// Тесты: tests/integration/schedule.test.ts; маршрут зарегистрирован в tests/security/manifest.ts.

/** GET /api/me/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD → 200 ScheduleDTO */
export const GET = route(async (req) => {
  const me = await requireStudent(req);
  const query = parseQuery(req, scheduleQuery);
  const at = now();
  const range = scheduleRange(query, toMskDate(at), mskParts(at).weekday);
  const schedule = await withUserTx(me.userId, (tx) =>
    getMySchedule(tx, { studentId: me.studentId, groupId: me.groupId }, range),
  );
  return ok<ScheduleDTO>(schedule);
});
