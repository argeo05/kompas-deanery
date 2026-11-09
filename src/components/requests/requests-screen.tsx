"use client";

import * as React from "react";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { ApiView } from "@/components/screens/api-view";
import { useStudent } from "@/components/shell/student-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingRegion, SkeletonCard } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Paged, RequestDTO, RequestsTab } from "@/contracts/api";
import { formatDayMonthFull, plural } from "@/lib/format";
import { badgeLabel } from "@/lib/request-copy";
import { useApi } from "@/lib/use-api";
import { cn } from "cn";

// «Мои заявки» (SPEC §6.5 п.4, §7.5): вкладки «Активные» и «Архив», карточка с номером, статусом,
// сроком и точкой «есть новое».

const TABS: { id: Exclude<RequestsTab, "all">; label: string }[] = [
  { id: "active", label: "Активные" },
  { id: "archive", label: "Архив" },
];

function dueText(r: RequestDTO, now: number): string | null {
  if (r.status === "issued" || r.status === "rejected" || r.status === "cancelled") return null;
  if (r.status === "ready") return null;
  if (r.overdue) {
    const days = Math.max(1, Math.round((now - new Date(r.dueAt).getTime()) / 86_400_000));
    return `Срок прошёл на ${days} ${plural(days, ["день", "дня", "дней"])} · мы напомнили сотруднику`;
  }
  return `Готово к ${formatDayMonthFull(r.dueAt)}`;
}

function RequestRow({ r }: { r: RequestDTO }) {
  const [now] = React.useState(() => Date.now());
  const due = dueText(r, now);
  return (
    <Card variant="interactive" className="gap-2" data-testid="request-row">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 type-h3">
          <Link href={`/requests/${r.id}`} className="card-link">
            {r.type.title}
            {r.unseen && <span className="sr-only">, есть новое</span>}
          </Link>
        </h2>
        {r.unseen && (
          <span className="mt-0.5 flex shrink-0 items-center gap-1.5 type-caption text-accent">
            <span aria-hidden className="size-2.5 rounded-full bg-accent" />
            Новое
          </span>
        )}
      </div>
      <p className="type-caption text-ink-2">{r.number}</p>
      <StatusBadge kind="request" status={r.status} label={badgeLabel(r)} />
      {due && (
        <p className={cn("type-caption", r.overdue ? "text-warn-fg" : "text-ink-2")}>{due}</p>
      )}
    </Card>
  );
}

export function RequestsScreen() {
  const { userId } = useStudent();
  const [tab, setTab] = React.useState<(typeof TABS)[number]["id"]>("active");
  const api = useApi<Paged<RequestDTO>>(`/api/me/requests?tab=${tab}&limit=50`, {
    scope: userId,
    refreshMs: 60_000,
  });

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="type-h1">Заявки</h1>
        <Button asChild>
          <Link href="/requests/new">
            <Plus aria-hidden />
            Подать заявку
          </Link>
        </Button>
      </header>
      <div role="group" aria-label="Какие заявки показать" className="flex gap-2">
        {TABS.map((t) => (
          <Button
            key={t.id}
            variant={tab === t.id ? "primary" : "secondary"}
            size="sm"
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>
      <ApiView
        api={api}
        skeleton={
          <LoadingRegion label="Загружаем заявки…">
            <SkeletonCard />
            <SkeletonCard />
          </LoadingRegion>
        }
      >
        {(page) =>
          page.items.length === 0 ? (
            tab === "active" ? (
              <EmptyState
                illustration="no-requests"
                title="Заявок пока нет"
                action={
                  <Button asChild>
                    <Link href="/requests/new">Заказать справку</Link>
                  </Button>
                }
              >
                Чаще всего заказывают справку об обучении — это 1 рабочий день.
              </EmptyState>
            ) : (
              <EmptyState illustration="nothing-found" title="В архиве пусто">
                Выданные, отклонённые и отменённые заявки появятся здесь.
              </EmptyState>
            )
          ) : (
            <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
              {page.items.map((r) => (
                <li key={r.id}>
                  <RequestRow r={r} />
                </li>
              ))}
            </ul>
          )
        }
      </ApiView>
      <p>
        <Button asChild variant="link">
          <Link href="/documents">
            <FileText aria-hidden className="size-4" />
            Мои документы
          </Link>
        </Button>
      </p>
    </>
  );
}
