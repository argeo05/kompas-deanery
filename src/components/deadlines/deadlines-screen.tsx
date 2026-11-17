"use client";

import * as React from "react";
import { CalendarClock, Check, Star, TriangleAlert, Undo2 } from "lucide-react";
import { ApiView } from "@/components/screens/api-view";
import { useStudent } from "@/components/shell/student-context";
import { StudyTabs } from "@/components/study/study-tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/error-state";
import { Sheet } from "@/components/ui/sheet";
import { LoadingRegion, SkeletonCard } from "@/components/ui/skeleton";
import { Badge, OutboxBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import type {
  DeadlineDTO,
  DeadlineWindowsDTO,
  DeadlinesDTO,
  PlanDTO,
  TimeWindow,
} from "@/contracts/api";
import { formatTimeMsk, formatWeekdayLong, formatWhen } from "@/lib/format";
import type { OutboxItem } from "@/lib/offline/outbox";
import { queueAction, useOutbox } from "@/lib/offline/use-outbox";
import { sendJson } from "@/lib/send-json";
import { useApi } from "@/lib/use-api";
import { useNow } from "@/lib/use-now";

// Дедлайны и планы «если–то» (SPEC §6.7). Группы: «Горит», «На этой неделе», «Позже», «Сделано».
// «Когда займусь?» только для важного (со звёздочкой) и для дедлайнов с риском: лишняя кнопка — шум.
// Без серий и штрафных напоминаний.

const PLACES = ["В библиотеке", "Дома", "Между парами"] as const;
const OWN = "Своё место";

/** Формулировка «если–то» из SPEC §6.7 п.6, дословно в карточке и в напоминании. */
export function planSentence(p: PlanDTO): string {
  return `Если ${formatWeekdayLong(p.startsAt)}, ${formatTimeMsk(p.startsAt)}, ${p.place.toLowerCase()} — ${p.firstAction}`;
}

function PlanSheet({
  deadline,
  onClose,
  onSaved,
}: {
  deadline: DeadlineDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { userId } = useStudent();
  const url = deadline ? `/api/me/deadlines/${deadline.id}/windows` : null;
  const api = useApi<DeadlineWindowsDTO>(url, { scope: userId });
  const [choice, setChoice] = React.useState(0);
  const [place, setPlace] = React.useState<string>(PLACES[0]);
  const [own, setOwn] = React.useState("");
  const [action, setAction] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const ids = { place: React.useId(), own: React.useId(), action: React.useId() };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const w: TimeWindow | undefined = api.data?.windows[choice];
    const finalPlace = place === OWN ? own.trim() : place;
    if (!deadline || !w || !action.trim() || !finalPlace) return;
    setPending(true);
    setError(null);
    try {
      const end = Math.min(
        new Date(w.endsAt).getTime(),
        new Date(w.startsAt).getTime() + 90 * 60_000,
      );
      const res = await sendJson("POST", "/api/me/plans", {
        deadlineId: deadline.id,
        startsAt: w.startsAt,
        endsAt: new Date(end).toISOString(),
        place: finalPlace,
        firstAction: action.trim(),
      });
      if (res.status !== 201 && res.status !== 200) throw new Error(String(res.status));
      toast({ tone: "success", title: "План сохранён", description: "Напомним в начале окна." });
      setAction("");
      onSaved();
      onClose();
    } catch {
      setError(
        "Не получилось сохранить план. Проверьте интернет и нажмите «Сохранить план» ещё раз.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet
      open={deadline !== null}
      onOpenChange={(o) => !o && onClose()}
      title="Когда займусь?"
      description={deadline?.title}
    >
      <form onSubmit={save} className="flex flex-col gap-4 px-4 pb-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-medium">Выберите окно без пар</legend>
          {api.loading && <p className="text-ink-2">Ищем свободные окна…</p>}
          {api.error && !api.data && (
            <InlineError>Не удалось найти окна. Закройте окно и откройте снова.</InlineError>
          )}
          {api.data?.windows.length === 0 && (
            <p className="text-ink-2">
              В ближайшие 7 дней свободных окон нет. Загляните позже или сдвиньте срок.
            </p>
          )}
          {api.data?.windows.map((w, i) => (
            <label
              key={w.startsAt}
              className="flex min-h-11 items-center gap-3 rounded-control border border-line-strong bg-surface px-3"
            >
              <input
                type="radio"
                name="window"
                checked={choice === i}
                onChange={() => setChoice(i)}
                className="size-5 accent-[var(--accent)]"
              />
              <span>
                {formatWeekdayLong(w.startsAt)}, {formatTimeMsk(w.startsAt)}–
                {formatTimeMsk(w.endsAt)}
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.place} className="font-medium">
            Где
          </label>
          <select
            id={ids.place}
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-base text-ink"
          >
            {[...PLACES, OWN].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        {place === OWN && (
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.own} className="font-medium">
              Какое место
            </label>
            <input
              id={ids.own}
              value={own}
              maxLength={60}
              onChange={(e) => setOwn(e.target.value)}
              className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-base text-ink"
            />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.action} className="font-medium">
            Что сделаю первым
          </label>
          <input
            id={ids.action}
            value={action}
            maxLength={120}
            onChange={(e) => setAction(e.target.value)}
            placeholder="Например: открою черновик и напишу введение"
            className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-ink-2"
          />
        </div>
        {error && <InlineError>{error}</InlineError>}
        <Button
          type="submit"
          loading={pending}
          disabled={!api.data?.windows.length || !action.trim() || (place === OWN && !own.trim())}
        >
          Сохранить план
        </Button>
      </form>
    </Sheet>
  );
}

function DeadlineCard({
  d: server,
  now,
  busy,
  queued,
  onAct,
  onPlan,
}: {
  d: DeadlineDTO;
  now: Date;
  busy: boolean;
  /** Отметка из офлайн-очереди: показываем её сразу, сервер узнает позже. */
  queued?: OutboxItem;
  onAct: (d: DeadlineDTO, a: "star" | "unstar" | "done" | "undone") => void;
  onPlan: (d: DeadlineDTO) => void;
}) {
  const d = queued ? { ...server, done: queued.kind === "deadline.done" } : server;
  const canPlan = !d.done && (d.starred || d.risk);
  return (
    <Card id={`d-${d.id}`} className="scroll-mt-24 gap-2 p-3">
      <p className="type-body-strong break-words hyphens-auto">{d.title}</p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 type-caption text-ink-2">
        <CalendarClock aria-hidden className="size-4" />
        <span>{formatWhen(d.dueAt, now)}</span>
        {d.courseTitle && <span>· {d.courseTitle}</span>}
        {d.risk && (
          <Badge tone="warn" icon={TriangleAlert}>
            Важно для итога
          </Badge>
        )}
      </p>
      {queued && <OutboxBadge state={queued.state} />}
      {d.plan && (
        <p className="rounded-control bg-info-bg p-2 type-body text-info-fg">
          {planSentence(d.plan)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!d.done && (
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={d.starred}
            loading={busy}
            onClick={() => onAct(d, d.starred ? "unstar" : "star")}
          >
            <Star aria-hidden className="size-4" fill={d.starred ? "currentColor" : "none"} />
            {d.starred ? "Важное" : "Отметить важным"}
          </Button>
        )}
        {canPlan && (
          <Button variant="secondary" size="sm" onClick={() => onPlan(d)}>
            {d.plan ? "Изменить план" : "Когда займусь?"}
          </Button>
        )}
        {d.done ? (
          <Button variant="ghost" size="sm" loading={busy} onClick={() => onAct(d, "undone")}>
            <Undo2 aria-hidden className="size-4" />
            Вернуть в работу
          </Button>
        ) : (
          <Button variant="ghost" size="sm" loading={busy} onClick={() => onAct(d, "done")}>
            <Check aria-hidden className="size-4" />
            Сделал
          </Button>
        )}
      </div>
    </Card>
  );
}

function AddForm({ onAdded }: { onAdded: () => void }) {
  const toast = useToast();
  const [title, setTitle] = React.useState("");
  const [due, setDue] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const ids = { t: React.useId(), d: React.useId() };

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !due) return;
    setPending(true);
    setError(null);
    try {
      const res = await sendJson("POST", "/api/me/deadlines", {
        title: title.trim(),
        dueAt: new Date(`${due}:00+03:00`).toISOString(),
      });
      if (!res.ok) throw new Error(String(res.status));
      setTitle("");
      setDue("");
      toast({ tone: "success", title: "Дедлайн добавлен" });
      onAdded();
    } catch {
      setError("Не получилось добавить. Проверьте дату и нажмите «Добавить» ещё раз.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={add} className="flex flex-col gap-3">
      <h2 className="type-h2">Свой дедлайн</h2>
      <div className="flex flex-col gap-1">
        <label htmlFor={ids.t} className="font-medium">
          Что нужно сделать
        </label>
        <input
          id={ids.t}
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-base text-ink"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={ids.d} className="font-medium">
          Срок (по Москве)
        </label>
        <input
          id={ids.d}
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-base text-ink"
        />
      </div>
      {error && <InlineError>{error}</InlineError>}
      <Button
        type="submit"
        variant="secondary"
        loading={pending}
        disabled={!title.trim() || !due}
        className="self-start"
      >
        Добавить
      </Button>
    </form>
  );
}

const GROUPS = [
  ["hot", "Горит (до 48 часов)"],
  ["week", "На этой неделе"],
  ["later", "Позже"],
  ["done", "Сделано"],
] as const;

export function DeadlinesScreen() {
  const { userId } = useStudent();
  const toast = useToast();
  const api = useApi<DeadlinesDTO>("/api/me/deadlines", { scope: userId, refreshMs: 60_000 });
  const now = useNow();
  const [planFor, setPlanFor] = React.useState<DeadlineDTO | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const queued = useOutbox(userId, (i) => i.kind.startsWith("deadline."));
  const queuedCount = React.useRef(queued.length);
  const reload = api.reload;
  // Отметки из очереди ушли на сервер — перечитываем список.
  React.useEffect(() => {
    if (queued.length < queuedCount.current) reload();
    queuedCount.current = queued.length;
  }, [queued.length, reload]);

  React.useEffect(() => {
    if (!api.data) return;
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: "center" });
  }, [api.data]);

  async function act(d: DeadlineDTO, a: "star" | "unstar" | "done" | "undone") {
    setBusy(d.id);
    const url = `/api/me/deadlines/${d.id}/${a}`;
    // «Сделал» / «Вернуть в работу» без сети — в очередь (SPEC §6.13 п.4), остальное требует сети.
    const queue =
      a === "done" || a === "undone"
        ? async () => {
            await queueAction({
              id: crypto.randomUUID(),
              userId,
              kind: `deadline.${a}`,
              url,
              label: a === "done" ? `«${d.title}» — сделано` : `«${d.title}» — вернули в работу`,
              target: d.id,
            });
            toast({
              tone: "info",
              title: "Отметим, когда появится сеть",
              description: "Отметка сохранена на телефоне.",
            });
          }
        : null;
    try {
      if (queue && !navigator.onLine) {
        await queue();
        return;
      }
      let res: Response;
      try {
        res = await sendJson("POST", url);
      } catch (err) {
        if (!queue) throw err;
        await queue();
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      api.reload();
    } catch {
      toast({
        tone: "error",
        title: "Не получилось сохранить",
        description: "Проверьте интернет и повторите.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <h1 className="type-h1">Учёба</h1>
      <StudyTabs />
      <ApiView
        api={api}
        skeleton={
          <LoadingRegion label="Загружаем дедлайны…">
            <SkeletonCard />
            <SkeletonCard />
          </LoadingRegion>
        }
      >
        {({ groups }) => {
          const total = GROUPS.reduce((n, [k]) => n + groups[k].length, 0);
          return (
            <>
              {total === 0 && (
                <EmptyState illustration="all-done" title="Дедлайнов нет">
                  Сроки по дисциплинам появятся здесь сами. Свой срок можно добавить ниже.
                </EmptyState>
              )}
              {GROUPS.map(([key, title]) =>
                groups[key].length === 0 ? null : (
                  <section key={key} aria-labelledby={`g-${key}`} className="flex flex-col gap-3">
                    <h2 id={`g-${key}`} className="type-h2">
                      {title}
                    </h2>
                    <ul className="flex flex-col gap-2">
                      {groups[key].map((d) => (
                        <li key={d.id}>
                          <DeadlineCard
                            d={d}
                            now={now}
                            busy={busy === d.id}
                            queued={queued.findLast((q) => q.target === d.id)}
                            onAct={act}
                            onPlan={setPlanFor}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                ),
              )}
              <AddForm onAdded={api.reload} />
            </>
          );
        }}
      </ApiView>
      <PlanSheet deadline={planFor} onClose={() => setPlanFor(null)} onSaved={api.reload} />
    </>
  );
}
