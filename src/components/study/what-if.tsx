"use client";

import * as React from "react";
import { GradeScale } from "@/components/ui/grade-scale";
import type { CourseGradesDTO } from "@/contracts/api";
import { formatScore } from "@/lib/format";
import { markFor, needShare, totalScore } from "@/lib/grading";

// Калькулятор «что если» (SPEC §6.4 п.4, AC-4.5): нативные ползунки по несданным элементам,
// итог пересчитывается сразу, ничего не сохраняется. Расчёт — та же функция, что на сервере.

type Item = CourseGradesDTO["items"][number];

/**
 * Стартовое значение ползунка — минимум для «Удовлетворительно» по той же формуле, что в
 * «Что поможет»: прогноз сразу отвечает «что нужно», а не показывает «Неудовлетворительно» при нуле.
 */
function startValue(items: Item[], passTotal: number, item: Item): number {
  const share = needShare(items, passTotal);
  if (share === null) return 0;
  return Math.min(item.max, Math.ceil(Math.min(share, 1) * item.max - 1e-9));
}

export function WhatIf({ items, passTotal }: { items: Item[]; passTotal: number }) {
  const open = items.filter((i) => i.score === null);
  const [guess, setGuess] = React.useState<Record<string, number>>({});
  if (open.length === 0) return null;
  const valueOf = (i: Item) => guess[i.id] ?? startValue(items, passTotal, i);

  const sim = items.map((i) => ({
    score: i.score ?? valueOf(i),
    max: i.max,
    weight: i.weight,
  }));
  const total = totalScore(sim);
  const mark = markFor(total);

  return (
    <section aria-labelledby="whatif-title" className="flex flex-col gap-3">
      <h2 id="whatif-title" className="type-h2">
        Что если
      </h2>
      <p className="type-caption text-ink-2">
        Ползунки сначала стоят на минимуме для «Удовлетворительно». Передвиньте их, чтобы увидеть
        другой итог. Это прогноз, а не оценка: ничего не сохраняется.
      </p>
      <ul className="flex flex-col gap-4">
        {open.map((i) => {
          const value = valueOf(i);
          const id = `whatif-${i.id}`;
          return (
            <li key={i.id} className="flex flex-col gap-1">
              <div className="flex justify-between gap-2 type-body">
                <label htmlFor={id} className="min-w-0 break-words hyphens-auto">
                  {i.title}
                </label>
                <span aria-hidden className="shrink-0 type-num">
                  {formatScore(value)} из {formatScore(i.max)}
                </span>
                <output htmlFor={id} aria-live="off" className="sr-only">
                  {formatScore(value)} из {formatScore(i.max)}
                </output>
              </div>
              <input
                id={id}
                type="range"
                min={0}
                max={i.max}
                step={1}
                value={value}
                aria-valuetext={`${formatScore(value)} из ${formatScore(i.max)}`}
                onChange={(e) => setGuess((g) => ({ ...g, [i.id]: Number(e.target.value) }))}
                className="min-h-11 w-full accent-accent"
              />
            </li>
          );
        })}
      </ul>
      <div className="rounded-card bg-surface-2 p-3">
        <p className="type-caption text-ink-2">Итог при таких баллах (прогноз)</p>
        <GradeScale total={total} mark={mark} variant="card" />
      </div>
    </section>
  );
}
