"use client";

import { cn } from "cn";
import { ClassCard, GhostCard } from "@/components/schedule/class-card";
import { classDate } from "@/components/schedule/class-meta";
import type { ClassDTO, ScheduleDTO } from "@/contracts/api";
import { formatDayMonthFull, formatWeekdayLong } from "@/lib/format";
import { startOfDayMsk } from "@/lib/time";

// Вид «Неделя» (SPEC §6.3 п.2): на мобильной — список по дням с липкими заголовками дат,
// на десктопе — сетка пн–сб (воскресенье появляется, только если в нём есть пары).
// Сетка не «по часам»: пары стоят в колонке дня по реальному началу.

export function WeekView({
  days,
  data,
  today,
  now,
  hrefFor,
}: {
  days: string[];
  data: ScheduleDTO;
  today: string;
  now: Date;
  hrefFor: (cls: ClassDTO) => string;
}) {
  const byId = new Map(data.classes.map((c) => [c.id, c]));
  const nowMs = now.getTime();
  const sundayBusy = data.classes.some((c) => classDate(c.startsAt) === days[6]);
  const shown = sundayBusy ? days : days.slice(0, 6);

  return (
    <div
      className={cn(
        "flex flex-col gap-4 lg:grid lg:items-start lg:gap-3",
        sundayBusy ? "lg:grid-cols-7" : "lg:grid-cols-6",
      )}
    >
      {shown.map((iso) => {
        const ofDay = data.classes
          .filter((c) => classDate(c.startsAt) === iso)
          .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
        const ghosts = data.ghostSlots.filter((g) => classDate(g.originalStartsAt) === iso);
        const at = startOfDayMsk(iso);
        return (
          <section key={iso} aria-labelledby={`wk-${iso}`} className="flex min-w-0 flex-col gap-2">
            <h2
              id={`wk-${iso}`}
              className={cn(
                "sticky top-(--header-h) z-10 bg-bg py-1 type-h3 lg:static",
                iso === today && "text-accent",
              )}
            >
              {formatWeekdayLong(at)}, {formatDayMonthFull(at)}
              {iso === today && " · сегодня"}
            </h2>
            {ofDay.length === 0 && ghosts.length === 0 ? (
              <p className="type-caption text-ink-2">Занятий нет</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {ghosts.map((g) => (
                  <li key={`g-${g.classId}`}>
                    <GhostCard
                      cls={byId.get(g.classId)}
                      originalStartsAt={g.originalStartsAt}
                      movedTo={g.movedTo}
                    />
                  </li>
                ))}
                {ofDay.map((c) => (
                  <li key={c.id}>
                    <ClassCard
                      className="scroll-mt-24"
                      cls={c}
                      href={hrefFor(c)}
                      compact
                      state={iso === today && Date.parse(c.endsAt) <= nowMs ? "past" : "upcoming"}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
