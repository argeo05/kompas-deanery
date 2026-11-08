import type { ClassNoteDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { notFound, ok, parseJson, route } from "@/server/http";
import { setMyClassNote } from "@/server/services/schedule";
import { classIdParams, classNoteBody } from "@/server/schemas/schedule";

// Личная заметка студента к паре (DS-11, SPEC §6.3 п.6). Пара должна принадлежать расписанию
// студента — чужая или несуществующая, как и «кривой» id, отвечает одинаково 404 NOT_FOUND.
// Тесты: tests/integration/schedule.test.ts; маршрут зарегистрирован в tests/security/manifest.ts.

/** PUT /api/me/classes/:classId/note — тело { text } (0–500, пустая строка удаляет) → 200 { note } */
export const PUT = route<{ classId: string }>(async (req, ctx) => {
  const me = await requireStudent(req);
  const params = classIdParams.safeParse(await ctx.params);
  if (!params.success) notFound();
  const body = await parseJson(req, classNoteBody);
  const note = await withUserTx(me.userId, (tx) =>
    setMyClassNote(
      tx,
      { studentId: me.studentId, groupId: me.groupId },
      params.data.classId,
      body.text,
    ),
  );
  return ok<ClassNoteDTO>({ note });
});
