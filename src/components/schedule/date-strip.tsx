"use client";

import { cn } from "cn";
import type { ClassDTO } from "@/contracts/api";
import { formatDayMonthFull, formatWeekdayLong, formatWeekdayShort } from "@/lib/format";
import { startOfDayMsk } from "@/lib/time";
import { classDate } from "./class-meta";
import { dayNumber } from "./dates";

// Навигатор дат (SPEC §6.3 п.3): неделя из 7 дней; под числом точки — «есть пары» и янтарная «есть изменение».
// Точки дублируются скрытым текстом: смысл не держится на одном цвете (WCAG 1.4.1).

export function DateStrip({
  days,
  selected,
  today,
  classes,
  onSelect,
}: {
  days: string[];
  selected: string;
  today: string;
  classes: ClassDTO[];
  onSelect: (iso: string) => void;
}) {
  return (
    <ul className="grid grid-cols-7 gap-0.5" aria-label="Дни недели">
      {days.map((iso) => {
        const ofDay = classes.filter((c) => classDate(c.startsAt) === iso);
        const changed = ofDay.some((c) => c.change !== null);
        const at = startOfDayMsk(iso);
        return (
          <li key={iso}>
            <button
              type="button"
              onClick={() => onSelect(iso)}
              aria-current={iso === today ? "date" : undefined}
              aria-pressed={iso === selected}
              className={cn(
                "flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-control border px-0.5 py-1.5 text-sm",
                iso === selected
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-line bg-surface text-ink hover:bg-surface-2",
              )}
            >
              <span className={cn("text-xs", iso === selected ? "text-accent-ink" : "text-ink-2")}>
                {formatWeekdayShort(at)}
              </span>
              <span
                className={cn(
                  "text-base type-num",
                  iso === today && iso !== selected && "underline decoration-2 underline-offset-4",
                )}
              >
                {dayNumber(iso)}
              </span>
              <span aria-hidden className="flex h-2 items-center gap-1">
                {ofDay.length > 0 && <span className="size-1.5 rounded-full bg-current" />}
                {changed && <span className="size-1.5 rounded-full bg-warn ring-1 ring-surface" />}
              </span>
              <span className="sr-only">
                {formatWeekdayLong(at)}, {formatDayMonthFull(at)}
                {iso === today ? ", сегодня" : ""}
                {ofDay.length > 0 ? `, пар: ${ofDay.length}` : ", занятий нет"}
                {changed ? ", есть изменения" : ""}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
