import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { StudentProvider } from "@/components/shell/student-context";
import { getPageSession } from "@/server/auth/page-session";
import { withUserTx } from "@/server/db";
import { findStudentContext } from "@/server/repositories/session-context";
import { getStudentShell } from "@/server/services/shell";

// Кабинет студента (SPEC §5.2): общий layout группы (student). Сессия читается на сервере из cookie;
// гость уходит на /login, сотрудник — в свой раздел. Данные страниц берут сами экраны через /api/me/*.

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await getPageSession();
  if (!session) {
    const raw = (await headers()).get("x-pathname") ?? "";
    // Заголовок мог прийти от клиента на prefetch: берём только путь внутри сайта.
    const path = /^\/(?!\/)[\w\-/%.]*$/.test(raw) ? raw : "/today";
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  if (session.user.role !== "student") redirect("/staff/queue");

  const ctx = await findStudentContext(session.user.id);
  if (!ctx) redirect("/login");
  const student = {
    userId: session.user.id,
    studentId: session.user.id,
    groupId: ctx.groupId,
    facultyId: ctx.facultyId,
  };
  const shell = await withUserTx(student.userId, (tx) => getStudentShell(tx, student));

  return (
    <AppShell role="student" initials={shell.initials} badges={shell.badges}>
      <StudentProvider value={{ userId: student.userId, displayName: shell.displayName }}>
        {children}
      </StudentProvider>
    </AppShell>
  );
}
