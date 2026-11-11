import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { HttpError, route } from "@/server/http";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { exportMyData } from "@/server/services/export";

/** GET /api/me/export → JSON-файл со всеми данными студента (SPEC §6.11 п.5). Только свои данные. */
// Экспорт собирает много запросов к БД: не больше 5 в 10 минут на студента (SPEC §9.7).
const exportLimit = new RateLimiterMemory({ points: 5, duration: 600 });

export const GET = route(async (req) => {
  const me = await requireStudent(req);
  try {
    await exportLimit.consume(me.userId);
  } catch {
    throw new HttpError(429, "RATE_LIMITED");
  }
  const data = await withUserTx(me.userId, (tx) => exportMyData(tx, me.studentId));
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="kompas-my-data.json"',
      "cache-control": "no-store",
    },
  });
});
