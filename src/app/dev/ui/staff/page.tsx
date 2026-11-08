import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { Card, CardDescription, CardHeader, CardLink } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { devUiEnabled } from "@/lib/dev-ui";

// Оболочка кабинета сотрудника (SPEC §5.3) на витрине. Только в разработке.

export const metadata: Metadata = {
  title: "Витрина: кабинет сотрудника — Компас",
  robots: { index: false, follow: false },
};

export default function DevUiStaffPage() {
  if (!devUiEnabled()) notFound();
  return (
    <AppShell role="staff" initials="ЕС">
      <h1 className="text-3xl font-semibold">Очередь заявок</h1>
      <ul className="flex flex-col gap-3">
        {(["submitted", "in_progress", "needs_info"] as const).map((status, i) => (
          <li key={status}>
            <Card variant="interactive">
              <CardHeader>
                <CardLink href="/staff/queue">Справка об обучении · № 2026-014{i}</CardLink>
                <CardDescription>Студент 2 курса, группа МО-21</CardDescription>
              </CardHeader>
              <StatusBadge kind="request" status={status} />
            </Card>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
