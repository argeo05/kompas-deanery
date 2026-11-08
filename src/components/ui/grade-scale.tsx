import { cn } from "cn";
import type { MarkDTO } from "@/contracts/api";

// Оценка тройкой «98 / Отлично / A» (SPEC §6.4 п.8, как в ЛК МГИМО): баллы, слово, буква.
// Размеры и начертание заданы здесь одним местом: типографика по ролям (SPEC 1.3) меняется заменой классов.

const SIZE = {
  md: { score: "text-xl font-semibold", rest: "text-base" },
  lg: { score: "font-display text-3xl", rest: "text-lg" },
} as const;

export function GradeScale({
  total,
  mark,
  size = "md",
  className,
}: {
  total: number;
  mark: Pick<MarkDTO, "word" | "letter">;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const s = SIZE[size];
  return (
    <p data-slot="grade-scale" className={cn("flex flex-wrap items-baseline gap-x-2", className)}>
      <span className="sr-only">
        {total} баллов, оценка «{mark.word}», буква {mark.letter}
      </span>
      <span aria-hidden className={cn("tabular", s.score)}>
        {total}
      </span>
      <span aria-hidden className="text-ink-2">
        /
      </span>
      <span aria-hidden className={cn("font-medium", s.rest)}>
        {mark.word}
      </span>
      <span aria-hidden className="text-ink-2">
        /
      </span>
      <span aria-hidden className={cn("font-medium", s.rest)}>
        {mark.letter}
      </span>
    </p>
  );
}
