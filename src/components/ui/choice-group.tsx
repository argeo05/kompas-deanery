"use client";

import * as React from "react";
import { cn } from "cn";

// Выбор одного из нескольких вариантов (SPEC §7.4): группа радиокнопок в виде сегментов.
// Стрелки переключают, Tab уходит дальше (нативное поведение radio). Как ThemeToggle, но без иконок.
export function ChoiceGroup<T extends string>({
  legend,
  value,
  options,
  onChange,
  className,
}: {
  legend: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const name = React.useId();
  return (
    <fieldset className={cn("flex flex-col gap-2", className)}>
      <legend className="mb-2 text-sm font-medium text-ink-2">{legend}</legend>
      <div
        className="grid gap-1 rounded-control bg-surface-2 p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "relative flex min-h-11 cursor-pointer items-center justify-center rounded-control px-2 text-center text-sm font-medium text-ink-2",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
              "has-checked:bg-surface has-checked:font-semibold has-checked:text-ink has-checked:shadow-card has-checked:ring-1 has-checked:ring-line-strong",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
            {o.hint && <span className="sr-only"> ({o.hint})</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
