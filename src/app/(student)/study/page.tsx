import type { Metadata } from "next";
import { StudyScreen } from "@/components/study/study-screen";
import { now } from "@/lib/clock";
import { getPageSession } from "@/server/auth/page-session";
import { withUserTx } from "@/server/db";
import { gradesQuery } from "@/server/schemas/grades";
import { semesterGrades } from "@/server/services/grades";

export const metadata: Metadata = { title: "Учёба — Компас" };

export default async function StudyPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  const [session, params] = await Promise.all([getPageSession(), searchParams]);
  const semester = (Array.isArray(params.semester) ? params.semester[0] : params.semester) || null;
  const query = gradesQuery.safeParse({ semester: semester ?? undefined });
  if (session?.user.role !== "student" || !query.success) return <StudyScreen />;

  const userId = session.user.id;
  // Первый экран и API используют один сервис и одну область доступа. При сбое экран
  // по-прежнему может показать сохранённые данные и повторить запрос через API.
  const grades = await withUserTx(userId, (tx) => semesterGrades(tx, userId, query.data)).catch(
    () => undefined,
  );
  return (
    <StudyScreen
      key={userId}
      initial={grades && { userId, semester, grades, fetchedAt: now().getTime() }}
    />
  );
}
