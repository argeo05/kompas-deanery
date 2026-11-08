"use client";

import * as React from "react";
import { ClassCard, GhostCard } from "@/components/schedule/class-card";
import { classDate, overlaps } from "@/components/schedule/class-meta";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import type { ClassDTO, ScheduleDTO } from "@/contracts/api";
import { formatDuration, formatTimeMsk, formatWeekdayLong, formatDayMonthFull } from "@/lib/format";
import { startOfDayMsk } from "@/lib/time";
import Link from "next/link";

// Вид «День» (SPEC §6.3 п.1): вертикальный список по реальным началам пар, призраки перенесённых
// пар на старом месте, полоса «сейчас», окна между парами. Номер пары не показываем — важнее время.

type Entry =
  | { kind: "class"; at: number; cls: ClassDTO }
  | { kind: "ghost"; at: number; ghost: ScheduleDTO["ghostSlots"][number] };

export function DayView({
  date,
  data,
  today,
  now,
  nextDate,
  hrefFor,
  onJump,
}: {
  date: string;
  data: ScheduleDTO;
  today: string;
  now: Date;
  /** Ближайший день недели с парами после выбранного (для пустого дня). */
  nextDate: string | null;
  hrefFor: (cls: ClassDTO) => string;
  onJump: (iso: string) => void;
}) {
  const byId = new Map(data.classes.map((c) => [c.id, c]));
  const entries: Entry[] = [
    ...data.classes
      .filter((c) => classDate(c.startsAt) === date)
      .map((cls): Entry => ({ kind: "class", at: Date.parse(cls.startsAt), cls })),
    ...data.ghostSlots
      .filter((g) => classDate(g.originalStartsAt) === date)
      .map((ghost): Entry => ({ kind: "ghost", at: Date.parse(ghost.originalStartsAt), ghost })),
  ].sort((a, b) => a.at - b.at);

  if (entries.length === 0) {
    return (
      <EmptyState
        illustration="free-day"
        title="В этот день занятий нет"
        headingLevel="h2"
        action={
          nextDate ? (
            <Button variant="secondary" onClick={() => onJump(nextDate)}>
              Перейти к: {formatWeekdayLong(startOfDayMsk(nextDate))},{" "}
              {formatDayMonthFull(startOfDayMsk(nextDate))}
            </Button>
          ) : (
            <Link href="/schedule?view=week" className="text-base">
              Посмотреть всю неделю
            </Link>
          )
        }
      >
        {nextDate ? "Отдохните или займитесь делами." : "На этой неделе пар больше нет."}
      </EmptyState>
    );
  }

  const isToday = date === today;
  const nowMs = now.getTime();
  const items: React.ReactNode[] = [];
  let lineDone = !isToday;
  let prevEnd: number | null = null;
  const classesOfDay = entries.flatMap((e) => (e.kind === "class" ? [e.cls] : []));

  for (const e of entries) {
    if (!lineDone && e.at > nowMs) {
      items.push(<NowLine key="now" now={now} />);
      lineDone = true;
    }
    if (e.kind === "ghost") {
      items.push(
        <li key={`ghost-${e.ghost.classId}-${e.ghost.originalStartsAt}`}>
          <GhostCard
            cls={byId.get(e.ghost.classId)}
            originalStartsAt={e.ghost.originalStartsAt}
            movedTo={e.ghost.movedTo}
          />
        </li>,
      );
      continue;
    }
    const { cls } = e;
    if (prevEnd !== null) {
      const gap = (e.at - prevEnd) / 60_000;
      if (gap > 90) {
        items.push(
          <li key={`gap-${cls.id}`} className="px-1 text-sm text-ink-2">
            Окно {formatDuration(gap)}
          </li>,
        );
      }
    }
    prevEnd = Math.max(prevEnd ?? 0, Date.parse(cls.endsAt));
    const ended = Date.parse(cls.endsAt) <= nowMs;
    const running = isToday && Date.parse(cls.startsAt) <= nowMs && !ended;
    const clash = classesOfDay.some((o) => o.id !== cls.id && overlaps(o, cls));
    items.push(
      <li key={cls.id} className="flex flex-col gap-1">
        <ClassCard
          cls={cls}
          href={hrefFor(cls)}
          state={isToday && ended ? "past" : running ? "now" : "upcoming"}
        />
        {clash && (
          <p className="px-1 text-sm">
            Пары пересекаются по времени. <Link href="/support">Сообщите в деканат</Link>, чтобы это
            исправили
          </p>
        )}
      </li>,
    );
  }

  return <ol className="flex flex-col gap-2">{items}</ol>;
}

function NowLine({ now }: { now: Date }) {
  return (
    <li className="flex items-center gap-2 text-sm font-medium text-accent" data-slot="now-line">
      <span aria-hidden className="h-0.5 flex-1 rounded-full bg-accent" />
      <span>Сейчас {formatTimeMsk(now)}</span>
      <span aria-hidden className="h-0.5 flex-1 rounded-full bg-accent" />
    </li>
  );
}
