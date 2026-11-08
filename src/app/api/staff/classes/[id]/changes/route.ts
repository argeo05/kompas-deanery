import type { ScheduleChangeDTO, UUID } from "@/contracts/api";
import { requireStaff } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { notFound, ok, parseJson, route } from "@/server/http";
import { withIdempotency } from "@/server/idempotency";
import { scheduleChangeCreateBody, staffClassIdParams } from "@/server/schemas/schedule-staff";
import { createScheduleChange } from "@/server/services/schedule-staff";

// Изменение расписания сотрудником (DS-32, SPEC §6.3): перенос, отмена, смена аудитории
// или преподавателя. Пара чужого факультета — тот же 404, что и несуществующий id.
// После записи — audit и notify всем студентам пары (urgent, если пара сегодня или завтра).
// Маршрут зарегистрирован в tests/security/manifest.ts (DS-32).

/** POST /api/staff/classes/:id/changes → 201 ScheduleChangeDTO */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const staff = await requireStaff(req);
  const parsedId = staffClassIdParams.safeParse(await params);
  if (!parsedId.success) notFound();
  return withIdempotency(req, staff.userId, async () => {
    const body = await parseJson(req, scheduleChangeCreateBody);
    const dto = await withUserTx(staff.userId, (tx) =>
      createScheduleChange(tx, staff, parsedId.data.id as UUID, body),
    );
    if (!dto) notFound();
    return ok<ScheduleChangeDTO>(dto, { status: 201 });
  });
});
