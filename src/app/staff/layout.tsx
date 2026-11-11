import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ReleaseDevice } from "@/components/offline/release-device";
import { AppShell } from "@/components/shell/app-shell";
import { StaffProvider } from "@/components/shell/staff-context";
import { getPageSession } from "@/server/auth/page-session";
import { withUserTx } from "@/server/db";
import { findStaffContext } from "@/server/repositories/session-context";
import { getStaffIdentity } from "@/server/services/staff-reference";

// Кабинет сотрудника (SPEC §5.3, §6.9): общий layout /staff/*. Первый рубеж — proxy.ts,
// здесь роль проверяется ещё раз на сервере по сессии: студент уходит в свой кабинет, гость — на вход.

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await getPageSession();
  if (!session) {
    const raw = (await headers()).get("x-pathname") ?? "";
    const path = /^\/(?!\/)[\w\-/%.]*$/.test(raw) ? raw : "/staff/queue";
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  if (session.user.role !== "staff") redirect("/today");
  const ctx = await findStaffContext(session.user.id);
  if (!ctx) redirect("/login");
  const me = await withUserTx(session.user.id, (tx) => getStaffIdentity(tx, session.user.id));

  return (
    <AppShell role="staff" initials={me.initials}>
      <ReleaseDevice />
      <StaffProvider
        value={{ userId: session.user.id, displayName: me.displayName, unit: me.unit }}
      >
        {children}
      </StaffProvider>
    </AppShell>
  );
}
