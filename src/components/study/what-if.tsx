"use client";

import * as React from "react";
import { GradeScale } from "@/components/ui/grade-scale";
import type { CourseGradesDTO } from "@/contracts/api";
import { markFor, totalScore } from "@/lib/grading";

// Калькулятор «что если» (SPEC §6.4 п.4, AC-4.5): нативные ползунки по несданным элементам,
// итог пересчитывается сразу, ничего не сохраняется. Расчёт — та же функция, что на сервере.

type Item = CourseGradesDTO["items"][number];

export function WhatIf({ items }: { items: Item[] }) {
  const open = items.filter((i) => i.score === null);
  const [guess, setGuess] = React.useState<Record<string, number>>({});
  if (open.length === 0) return null;

  const sim = items.map((i) => ({
    score: i.score ?? guess[i.id] ?? 0,
    max: i.max,
    weight: i.weight,
  }));
  const total = totalScore(sim);
  const mark = markFor(total);

  return (
    <section aria-labelledby="whatif-title" className="flex flex-col gap-3">
      <h2 id="whatif-title" className="text-xl font-semibold">
        Что если
      </h2>
      <p className="text-sm text-ink-2">
        Передвиньте ползунки у работ, которые ещё не сданы. Это прогноз, а не оценка: ничего не
        сохраняется.
      </p>
      <ul className="flex flex-col gap-4">
        {open.map((i) => {
          const value = guess[i.id] ?? 0;
          const id = `whatif-${i.id}`;
          return (
            <li key={i.id} className="flex flex-col gap-1">
              <div className="flex justify-between gap-2 text-base">
                <label htmlFor={id} className="min-w-0 break-words hyphens-auto">
                  {i.title}
                </label>
                <span aria-hidden className="shrink-0 font-semibold tabular">
                  {value} из {i.max}
                </span>
                <output htmlFor={id} className="sr-only">
                  {value} из {i.max}
                </output>
              </div>
              <input
                id={id}
                type="range"
                min={0}
                max={i.max}
                step={1}
                value={value}
                aria-valuetext={`${value} из ${i.max}`}
                onChange={(e) => setGuess((g) => ({ ...g, [i.id]: Number(e.target.value) }))}
                className="min-h-11 w-full accent-accent"
              />
            </li>
          );
        })}
      </ul>
      <div className="rounded-card bg-surface-2 p-3">
        <p className="text-sm text-ink-2">Итог при таких баллах (прогноз)</p>
        <GradeScale total={total} mark={mark} size="lg" />
      </div>
    </section>
  );
}
