"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "cn";
import { ApiView } from "@/components/screens/api-view";
import { useStudent } from "@/components/shell/student-context";
import { Button } from "@/components/ui/button";
import { LoadingRegion, Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import type { ClassDTO, ScheduleDTO } from "@/contracts/api";
import { formatDayMonthFull, formatWeekdayLong } from "@/lib/format";
import { startOfDayMsk } from "@/lib/time";
import { useApi } from "@/lib/use-api";
import { useNow, useTodayIso } from "@/lib/use-now";
import { ClassSheet } from "./class-sheet";
import { classDate } from "./class-meta";
import { DateStrip } from "./date-strip";
import { addDays, isIsoDate, mondayOf, weekDays } from "./dates";
import { DayView } from "./day-view";
import { WeekView } from "./week-view";

// Экран «Расписание» (SPEC §6.3). Состояние — в адресе: ?d=2026-11-12&view=day|week&class=<id>.
// Так экран можно открыть по ссылке из «Сегодня» и из уведомлений, а «назад» закрывает карточку пары.

const SWIPE_PX = 60;
/** Жест «назад» в системе начинается у края экрана: свайп оттуда не считаем (AC-3.6). */
const EDGE_PX = 28;

function Skeleton_() {
  return (
    <LoadingRegion label="Загружаем расписание…">
      <Skeleton className="h-14 w-full rounded-control" />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </LoadingRegion>
  );
}

function ParityLine({ data }: { data: ScheduleDTO }) {
  const parity = data.weekParity ? (data.weekParity === "odd" ? "числитель" : "знаменатель") : null;
  return (
    <p className="type-caption text-ink-2">
      Неделя {data.weekNumber}
      {parity && ` · ${parity}`}
    </p>
  );
}

export function ScheduleScreen() {
  const { userId } = useStudent();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const todayIso = useTodayIso();

  const requested = params.get("d");
  const date = isIsoDate(requested) ? requested : todayIso;
  const view = params.get("view") === "week" ? "week" : "day";
  const classId = params.get("class");

  const days = date ? weekDays(date) : null;
  const url = days ? `/api/me/schedule?from=${days[0]}&to=${days[6]}` : null;
  const api = useApi<ScheduleDTO>(url, { scope: userId, refreshMs: 60_000 });
  const now = useNow();

  const go = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const select = (iso: string) => go({ d: iso, class: null });
  const step = (delta: number) => date && select(addDays(date, delta));

  // Свайп по списку дня. Вертикальная прокрутка остаётся за браузером (touch-pan-y).
  const touch = React.useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const edge = t && (t.clientX < EDGE_PX || t.clientX > window.innerWidth - EDGE_PX);
    touch.current = t && !edge ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    const t = e.changedTouches[0];
    touch.current = null;
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  };

  const hrefFor = (cls: ClassDTO) =>
    `${pathname}?d=${view === "day" ? date : classDate(cls.startsAt)}&view=${view}&class=${cls.id}`;

  const heading =
    date && `${formatWeekdayLong(startOfDayMsk(date))}, ${formatDayMonthFull(startOfDayMsk(date))}`;

  return (
    <>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="type-h1">Расписание</h1>
          <div role="group" aria-label="Вид расписания" className="flex gap-1">
            {(["day", "week"] as const).map((v) => (
              <Button
                key={v}
                variant={view === v ? "primary" : "secondary"}
                size="sm"
                aria-pressed={view === v}
                onClick={() => go({ view: v === "day" ? null : v, class: null })}
              >
                {v === "day" ? "День" : "Неделя"}
              </Button>
            ))}
          </div>
        </div>
        {date && todayIso && days && (
          <>
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="secondary"
                size="icon"
                aria-label={view === "day" ? "Предыдущий день" : "Предыдущая неделя"}
                onClick={() => step(view === "day" ? -1 : -7)}
              >
                <ChevronLeft aria-hidden />
              </Button>
              <p className="min-w-0 flex-1 text-center type-h3" aria-live="polite">
                {view === "day"
                  ? heading
                  : `${formatDayMonthFull(startOfDayMsk(days[0]!))} — ${formatDayMonthFull(startOfDayMsk(days[6]!))}`}
              </p>
              <Button
                variant="secondary"
                size="icon"
                aria-label={view === "day" ? "Следующий день" : "Следующая неделя"}
                onClick={() => step(view === "day" ? 1 : 7)}
              >
                <ChevronRight aria-hidden />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={date === todayIso && view === "day"}
                onClick={() => go({ d: null, class: null })}
              >
                Сегодня
              </Button>
              <input
                type="date"
                aria-label="Выбрать дату"
                value={date}
                onChange={(e) => isIsoDate(e.target.value) && select(e.target.value)}
                className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-base text-ink"
              />
              {api.data && <ParityLine data={api.data} />}
            </div>
            <DateStrip
              days={days}
              selected={date}
              today={todayIso}
              classes={api.data?.classes ?? []}
              onSelect={(iso) =>
                view === "day" ? select(iso) : go({ d: iso, view: "day", class: null })
              }
            />
          </>
        )}
      </header>

      <ApiView api={api} skeleton={<Skeleton_ />}>
        {(data) => (
          <>
            <div
              onTouchStart={view === "day" ? onTouchStart : undefined}
              onTouchEnd={view === "day" ? onTouchEnd : undefined}
              className={cn("flex flex-col gap-4", view === "day" && "touch-pan-y")}
            >
              {data.classes.some((c) => c.type === "exam") && (
                <p className="rounded-control bg-info-bg p-3 type-caption text-info-fg">
                  На этой неделе есть экзамены. Даты и аудитории смотрите во вкладке{" "}
                  <Link href="/study/session">«Сессия»</Link> раздела «Учёба».
                </p>
              )}
              {date && todayIso && view === "day" && (
                <DayView
                  date={date}
                  data={data}
                  today={todayIso}
                  now={now}
                  nextDate={
                    weekDays(date)
                      .filter((d) => d > date)
                      .find((d) => data.classes.some((c) => classDate(c.startsAt) === d)) ?? null
                  }
                  hrefFor={hrefFor}
                  onJump={select}
                />
              )}
              {date && todayIso && view === "week" && (
                <WeekView
                  days={weekDays(mondayOf(date))}
                  data={data}
                  today={todayIso}
                  now={now}
                  hrefFor={hrefFor}
                />
              )}
            </div>
            <ClassSheet
              cls={data.classes.find((c) => c.id === classId) ?? null}
              onClose={() => go({ class: null })}
              onChanged={api.reload}
            />
          </>
        )}
      </ApiView>
    </>
  );
}
