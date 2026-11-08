import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { noContent, parseJson, route } from "@/server/http";
import { markMyChangesSeen } from "@/server/services/schedule";
import { changesSeenBody } from "@/server/schemas/schedule";

// Отметка изменений расписания просмотренными (DS-11, SPEC §6.3 п.5).
// Свои id — в schedule_change_views; чужие id молча отбрасываются (ответ всё равно 204).
// Тесты: tests/integration/schedule.test.ts; маршрут зарегистрирован в tests/security/manifest.ts.

/** POST /api/me/schedule/changes/seen — тело { changeIds: UUID[] } (1–50) → 204 */
export const POST = route(async (req) => {
  const me = await requireStudent(req);
  const body = await parseJson(req, changesSeenBody);
  await withUserTx(me.userId, (tx) =>
    markMyChangesSeen(tx, { studentId: me.studentId, groupId: me.groupId }, body.changeIds),
  );
  return noContent();
});
