"use client";

import Link from "next/link";
import { MoreLink } from "@/components/ui/more-link";
import { ClassCard } from "@/components/schedule/class-card";
import { classDate, overlaps } from "@/components/schedule/class-meta";
import type { ClassDTO } from "@/contracts/api";
import { formatDuration, plural } from "@/lib/format";
import { NowLine } from "@/components/ui/now-line";

// Лента дня (SPEC §6.2 п.3, §7.5): оставшиеся пары, прошедшие свёрнуты строкой «Прошло: 2 пары»,
// линия «сейчас», «Окно 1 ч 40 мин» между парами с разрывом > 90 мин, пометка о пересечении.

const WINDOW_MIN = 90;

export function DayFeed({ classes, now }: { classes: ClassDTO[]; now: Date }) {
  const nowMs = now.getTime();
  const ended = (c: ClassDTO) => Date.parse(c.endsAt) <= nowMs;
  const passed = classes.filter(ended);
  const rest = classes.filter((c) => !ended(c));
  const started = (c: ClassDTO) => Date.parse(c.startsAt) <= nowMs;
  const lineIndex = rest.findIndex((c) => !started(c));

  const items: React.ReactNode[] = [];
  rest.forEach((c, i) => {
    if (i === lineIndex) items.push(<NowLine key="now" now={now} />);
    const prev = rest[i - 1];
    if (prev) {
      const gap = (Date.parse(c.startsAt) - Date.parse(prev.endsAt)) / 60_000;
      if (gap > WINDOW_MIN) {
        items.push(
          <li key={`gap-${c.id}`} className="px-1 type-caption text-ink-2">
            Окно {formatDuration(gap)}
          </li>,
        );
      }
    }
    const clash = rest.some((o) => o.id !== c.id && overlaps(o, c));
    items.push(
      <li key={c.id} className="flex flex-col gap-1">
        <ClassCard
          cls={c}
          compact
          state={started(c) ? "now" : "upcoming"}
          href={`/schedule?d=${classDate(c.startsAt)}&class=${c.id}`}
        />
        {clash && (
          <p className="px-1 type-caption text-ink">
            Пары пересекаются по времени. <Link href="/support">Сообщите в деканат</Link>
          </p>
        )}
      </li>,
    );
  });
  if (lineIndex === -1 && rest.length > 0) items.push(<NowLine key="now" now={now} />);

  return (
    <section
      aria-labelledby="day-feed-title"
      className="@container flex flex-col gap-2 [overflow-wrap:anywhere]"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <h2 id="day-feed-title" className="type-h2">
          Сегодня
        </h2>
        <MoreLink href="/schedule" className="max-w-full @min-[16rem]:-my-2.5">
          Все пары
        </MoreLink>
      </div>
      {passed.length > 0 && (
        <p className="type-caption text-ink-2">
          Прошло: {passed.length} {plural(passed.length, ["пара", "пары", "пар"])}
        </p>
      )}
      {rest.length > 0 ? (
        <ol className="flex flex-col gap-2">{items}</ol>
      ) : (
        <p className="type-body text-ink-2">
          {classes.length === 0 ? "Сегодня занятий нет." : "Пары на сегодня закончились."}
        </p>
      )}
    </section>
  );
}
