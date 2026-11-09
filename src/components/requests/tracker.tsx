import * as React from "react";
import { Check, Circle } from "lucide-react";
import type { RequestDetailDTO, RequestEventDTO, RequestStatus } from "@/contracts/api";
import { formatDayMonth, formatTimeMsk } from "@/lib/format";
import { eventTitle } from "@/lib/request-copy";
import { cn } from "cn";

// Трекер заявки (SPEC §6.5 п.5, п.11): вертикальная линия этапов с датой и временем.
// Каждый пройденный этап — настоящее событие из request_events, без искусственных пауз.
// Новое событие появляется один раз мягким проявлением (animate-ink-in), постоянной анимации нет.
// Впереди серым показаны только ещё не наступившие этапы — без «мы работаем»-имитации.

const TONE: Record<RequestStatus, string> = {
  submitted: "bg-neutral-bg text-neutral-fg",
  in_progress: "bg-info-bg text-info-fg",
  needs_info: "bg-warn-bg text-warn-fg",
  ready: "bg-ok-bg text-ok-fg",
  issued: "bg-ok-bg text-ok-fg",
  rejected: "bg-coral-bg text-coral-fg",
  cancelled: "bg-neutral-bg text-neutral-fg",
};

/** Этапы, которых заявка ещё не прошла. Для завершённых заявок — пусто. */
function upcoming(events: RequestEventDTO[], status: RequestStatus): string[] {
  if (status === "rejected" || status === "cancelled" || status === "issued") return [];
  const reached = new Set(events.map((e) => e.toStatus));
  const steps: [RequestStatus, string][] = [
    ["in_progress", "Принята в работу"],
    ["ready", "Готова"],
    ["issued", "Выдана"],
  ];
  return steps.filter(([s]) => !reached.has(s)).map(([, title]) => title);
}

function Dot({ done, status }: { done: boolean; status?: RequestStatus }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative z-10 grid size-6 shrink-0 place-items-center rounded-full border",
        done && status
          ? `${TONE[status]} border-transparent`
          : "border-line-strong bg-surface text-ink-2",
      )}
    >
      {done ? <Check className="size-3.5" /> : <Circle className="size-2" />}
    </span>
  );
}

export function Tracker({ request }: { request: RequestDetailDTO }) {
  const future = upcoming(request.events, request.status);
  return (
    <section aria-labelledby="tracker-title" className="flex flex-col gap-3">
      <h2 id="tracker-title" className="type-h2">
        Ход заявки
      </h2>
      <ol className="relative flex flex-col gap-4 before:absolute before:top-3 before:bottom-3 before:left-3 before:w-px before:bg-line-strong">
        {request.events.map((e) => (
          <li key={e.id} className="flex animate-ink-in gap-3" data-testid="tracker-step">
            <Dot done status={e.toStatus} />
            <div className="min-w-0">
              <p className="font-medium">{eventTitle(e.fromStatus, e.toStatus)}</p>
              <p className="type-caption text-ink-2">
                {formatDayMonth(e.createdAt)}, {formatTimeMsk(e.createdAt)}
                {e.actor === "staff" && e.actorName ? ` · ${e.actorName}` : ""}
              </p>
              {e.comment && <p className="mt-1 whitespace-pre-wrap">{e.comment}</p>}
            </div>
          </li>
        ))}
        {future.map((title) => (
          <li key={title} className="flex gap-3 text-ink-2" data-testid="tracker-upcoming">
            <Dot done={false} />
            <p className="pt-0.5">{title}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
