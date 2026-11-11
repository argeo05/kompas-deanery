import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { route } from "@/server/http";
import { exportMyData } from "@/server/services/export";

/** GET /api/me/export → JSON-файл со всеми данными студента (SPEC §6.11 п.5). Только свои данные. */
export const GET = route(async (req) => {
  const me = await requireStudent(req);
  const data = await withUserTx(me.userId, (tx) => exportMyData(tx, me.studentId));
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="kompas-my-data.json"',
      "cache-control": "no-store",
    },
  });
});
