"use client";

import * as React from "react";
import Link from "next/link";
import { Inbox, SlidersHorizontal } from "lucide-react";
import { ApiView } from "@/components/screens/api-view";
import { useStaff } from "@/components/shell/staff-context";
import { Button } from "@/components/ui/button";
import { Card, CardLink } from "@/components/ui/card";
import { CheckRow, Field, SelectInput } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingRegion, SkeletonCard } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  RequestStatus,
  StaffReferenceDTO,
  StaffRequestRowDTO,
  StaffRequestsDTO,
} from "@/contracts/api";
import { formatDayMonth } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { SlaBadge } from "./sla";

// Очередь заявок (SPEC §6.9 п.1): таблица на широком экране, карточки на узком.
// Счётчики сверху, фильтры (статус, тип, «просрочено», «мои»), сортировка по сроку или по дате.
// Таблица своя, на семантическом <table>: TanStack Table для 7 колонок и серверных фильтров не нужен (D-013).

const STATUS_OPTIONS: { value: RequestStatus; label: string }[] = [
  { value: "submitted", label: "Отправлена" },
  { value: "in_progress", label: "В работе" },
  { value: "needs_info", label: "Нужно уточнение" },
  { value: "ready", label: "Готова" },
  { value: "issued", label: "Выдана" },
  { value: "rejected", label: "Отклонена" },
];

interface Filters {
  /** "open" — только открытые (по умолчанию); "" — все; остальное — конкретный статус. */
  status: string;
  type: string;
  overdue: boolean;
  mine: boolean;
  sort: "dueAt" | "createdAt";
}

function buildQuery(f: Filters, cursor?: string): string {
  const p = new URLSearchParams({ sort: f.sort, limit: "20" });
  if (f.status === "open") p.set("open", "true");
  else if (f.status) p.set("status", f.status);
  if (f.type) p.set("type", f.type);
  if (f.overdue) p.set("overdue", "true");
  if (f.mine) p.set("mine", "true");
  if (cursor) p.set("cursor", cursor);
  return `/api/staff/requests?${p.toString()}`;
}

function Counter({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="flex min-h-11 flex-1 flex-col items-start gap-0.5 rounded-card border border-line-strong bg-surface px-3 py-2 text-left hover:bg-surface-2 aria-pressed:border-2 aria-pressed:border-accent"
    >
      <span className="type-caption text-ink-2">{label}</span>
      <span className="text-2xl type-num">{value}</span>
    </button>
  );
}

function RowCard({ r, now }: { r: StaffRequestRowDTO; now: number }) {
  return (
    <Card variant="interactive" className="gap-2" data-testid="queue-row">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 type-h3">
          <CardLink href={`/staff/requests/${r.id}`}>{r.typeTitle}</CardLink>
        </h2>
        <StatusBadge kind="request" status={r.status} />
      </div>
      <p className="type-caption text-ink-2">
        {r.number} · {r.student.fullName}, {r.student.group}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <SlaBadge dueAt={r.dueAt} status={r.status} overdue={r.overdue} now={now} />
        <span className="type-caption text-ink-2">
          {r.assignee ? `Ведёт ${r.assignee}` : "Никто не взял"}
        </span>
      </div>
    </Card>
  );
}

function QueueTable({ rows, now }: { rows: StaffRequestRowDTO[]; now: number }) {
  return (
    <div className="hidden overflow-x-auto rounded-card border border-line bg-surface lg:block">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Очередь заявок</caption>
        <thead className="bg-surface-2 type-caption text-ink-2">
          <tr>
            {["Номер", "Тип", "Студент", "Создана", "Срок", "Статус", "Ведёт"].map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              data-testid="queue-row"
              className="border-t border-line hover:bg-surface-2/60"
            >
              <td className="px-3 py-2 type-num whitespace-nowrap">{r.number}</td>
              <td className="px-3 py-2">
                <Link
                  href={`/staff/requests/${r.id}`}
                  className="font-medium text-accent underline"
                >
                  {r.typeTitle}
                </Link>
              </td>
              <td className="px-3 py-2">
                {r.student.fullName}
                <span className="block type-caption text-ink-2">{r.student.group}</span>
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{formatDayMonth(r.createdAt)}</td>
              <td className="px-3 py-2">
                <SlaBadge dueAt={r.dueAt} status={r.status} overdue={r.overdue} now={now} />
              </td>
              <td className="px-3 py-2">
                <StatusBadge kind="request" status={r.status} />
              </td>
              <td className="px-3 py-2">
                {r.assignee ?? <span className="text-ink-2">Свободна</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function QueueScreen() {
  const { userId } = useStaff();
  const [filters, setFilters] = React.useState<Filters>({
    status: "open",
    type: "",
    overdue: false,
    mine: false,
    sort: "dueAt",
  });
  const [extra, setExtra] = React.useState<{
    key: string;
    rows: StaffRequestRowDTO[];
    next: string | null;
  } | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [showFilters, setShowFilters] = React.useState(false);
  const [now] = React.useState(() => Date.now());

  const url = buildQuery(filters);
  const api = useApi<StaffRequestsDTO>(url, { scope: userId, refreshMs: 60_000 });
  const ref = useApi<StaffReferenceDTO>("/api/staff/reference", { scope: userId });
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  const more = async (cursor: string) => {
    setLoadingMore(true);
    try {
      const res = await fetch(buildQuery(filters, cursor), { credentials: "same-origin" });
      if (res.ok) {
        const page = (await res.json()) as StaffRequestsDTO;
        setExtra((prev) => ({
          key: url,
          rows: [...(prev?.key === url ? prev.rows : []), ...page.items],
          next: page.nextCursor,
        }));
      }
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="type-h1">Очередь заявок</h1>
        <p className="text-ink-2">
          Заявки студентов вашего подразделения. Срок считается в рабочих днях.
        </p>
      </header>

      <ApiView
        api={api}
        skeleton={
          <LoadingRegion label="Загружаем очередь…">
            <SkeletonCard />
            <SkeletonCard />
          </LoadingRegion>
        }
      >
        {(page) => {
          const rows = [...page.items, ...(extra?.key === url ? extra.rows : [])];
          const next = extra?.key === url ? extra.next : page.nextCursor;
          return (
            <>
              <div role="group" aria-label="Счётчики очереди" className="flex gap-2">
                <Counter
                  label="Отправлены"
                  value={page.counters.submitted}
                  active={filters.status === "submitted"}
                  onClick={() =>
                    set({ status: filters.status === "submitted" ? "open" : "submitted" })
                  }
                />
                <Counter
                  label="В работе"
                  value={page.counters.inProgress}
                  active={filters.status === "in_progress"}
                  onClick={() =>
                    set({ status: filters.status === "in_progress" ? "open" : "in_progress" })
                  }
                />
                <Counter
                  label="Просрочено"
                  value={page.counters.overdue}
                  active={filters.overdue}
                  onClick={() => set({ overdue: !filters.overdue })}
                />
              </div>

              <Button
                variant="secondary"
                className="self-start lg:hidden"
                aria-expanded={showFilters}
                aria-controls="queue-filters"
                onClick={() => setShowFilters((v) => !v)}
              >
                <SlidersHorizontal aria-hidden />
                Фильтры
              </Button>
              <form
                id="queue-filters"
                aria-label="Фильтры очереди"
                onSubmit={(e) => e.preventDefault()}
                className={`${showFilters ? "grid" : "hidden"} gap-3 sm:grid-cols-2 lg:grid lg:grid-cols-4`}
              >
                <Field label="Статус">
                  {(p) => (
                    <SelectInput
                      {...p}
                      value={filters.status}
                      onChange={(e) => set({ status: e.target.value })}
                    >
                      <option value="open">Открытые</option>
                      <option value="">Все</option>
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </SelectInput>
                  )}
                </Field>
                <Field label="Тип заявки">
                  {(p) => (
                    <SelectInput
                      {...p}
                      value={filters.type}
                      onChange={(e) => set({ type: e.target.value })}
                    >
                      <option value="">Все</option>
                      {(ref.data?.requestTypes ?? []).map((t) => (
                        <option key={t.code} value={t.code}>
                          {t.title}
                        </option>
                      ))}
                    </SelectInput>
                  )}
                </Field>
                <Field label="Сортировка">
                  {(p) => (
                    <SelectInput
                      {...p}
                      value={filters.sort}
                      onChange={(e) => set({ sort: e.target.value as Filters["sort"] })}
                    >
                      <option value="dueAt">По сроку: горящие сверху</option>
                      <option value="createdAt">По дате подачи: новые сверху</option>
                    </SelectInput>
                  )}
                </Field>
                <fieldset className="flex flex-col">
                  <legend className="font-medium">Показать</legend>
                  <CheckRow
                    label="Только мои"
                    checked={filters.mine}
                    onChange={(e) => set({ mine: e.target.checked })}
                  />
                  <CheckRow
                    label="Только просроченные"
                    checked={filters.overdue}
                    onChange={(e) => set({ overdue: e.target.checked })}
                  />
                </fieldset>
              </form>

              {rows.length === 0 ? (
                <EmptyState illustration="all-done" title="Очередь пуста">
                  По выбранным фильтрам заявок нет. Сбросьте фильтры или зайдите позже.
                </EmptyState>
              ) : (
                <>
                  <p role="status" className="type-caption text-ink-2">
                    Показано заявок: {rows.length}
                  </p>
                  <QueueTable rows={rows} now={now} />
                  <ul className="flex flex-col gap-3 lg:hidden">
                    {rows.map((r) => (
                      <li key={r.id}>
                        <RowCard r={r} now={now} />
                      </li>
                    ))}
                  </ul>
                  {next && (
                    <Button
                      variant="secondary"
                      className="self-center"
                      loading={loadingMore}
                      onClick={() => void more(next)}
                    >
                      <Inbox aria-hidden />
                      Показать ещё
                    </Button>
                  )}
                </>
              )}
            </>
          );
        }}
      </ApiView>
    </>
  );
}
