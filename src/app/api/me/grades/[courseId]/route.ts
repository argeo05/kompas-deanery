import type { CourseGradesDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { notFound, ok, route } from "@/server/http";
import { courseIdParams } from "@/server/schemas/grades";
import { courseGrades } from "@/server/services/grades";

// DS-13. Дисциплина студента: оценки, история изменений, «сколько нужно» (SPEC §6.4).
// Чужая, несуществующая и «кривой» courseId — одинаково 404 NOT_FOUND.

/** GET /api/me/grades/:courseId → 200 CourseGradesDTO | 404 NOT_FOUND */
export const GET = route<{ courseId: string }>(async (req, { params }) => {
  const me = await requireStudent(req);
  const parsed = courseIdParams.safeParse(await params);
  if (!parsed.success) notFound();
  const dto = await withUserTx(me.userId, (tx) =>
    courseGrades(tx, me.studentId, parsed.data.courseId),
  );
  if (!dto) notFound();
  return ok<CourseGradesDTO>(dto);
});
