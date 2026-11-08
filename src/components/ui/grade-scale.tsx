import { cn } from "cn";
import type { MarkDTO } from "@/contracts/api";

// Оценка тройкой «98 / Отлично / A» (SPEC §7.2 «Оценка», §6.4 п.8, как в ЛК МГИМО).
// Главное — баллы, слово и буква — расшифровка. Оценку по качеству не окрашиваем:
// ни число, ни слово не получают статусный токен («Не стыдим»), риск показывает только StatusBadge.
// Диктор читает одну строку: «98 баллов, отлично, A» (aria-label у группы).

type Mark = Pick<MarkDTO, "word" | "letter">;

function label(total: number, mark: Mark): string {
  return `${total} баллов, ${mark.word.toLowerCase()}, ${mark.letter}`;
}

/**
 * - `row` — строка списка дисциплин: «98» Onest 18 px 600, под ним «Отлично · A»; столбец 4ch, по правому краю.
 * - `card` — шапка карточки дисциплины: «98» display, «из 100»; справа «Отлично» и чип «A».
 */
export function GradeScale({
  total,
  mark,
  variant = "row",
  className,
}: {
  total: number;
  mark: Mark;
  variant?: "row" | "card";
  className?: string;
}) {
  if (variant === "card") {
    return (
      <div
        role="group"
        aria-label={label(total, mark)}
        data-slot="grade-scale"
        data-variant="card"
        className={cn("flex items-center justify-between gap-4", className)}
      >
        <div aria-hidden className="flex flex-col">
          <span className="type-display">{total}</span>
          <span className="type-caption text-ink-2">из 100</span>
        </div>
        <div aria-hidden className="flex flex-col items-end gap-1">
          <span className="type-body-strong">{mark.word}</span>
          <span className="rounded-full bg-neutral-bg px-2.5 py-0.5 type-caption font-semibold text-neutral-fg">
            {mark.letter}
          </span>
        </div>
      </div>
    );
  }
  return (
    <div
      role="group"
      aria-label={label(total, mark)}
      data-slot="grade-scale"
      data-variant="row"
      className={cn("flex flex-col items-end text-right", className)}
    >
      <span aria-hidden className="min-w-[4ch] text-lg leading-snug type-num">
        {total}
      </span>
      <span aria-hidden className="type-caption whitespace-nowrap text-ink-2">
        {mark.word} · {mark.letter}
      </span>
    </div>
  );
}
