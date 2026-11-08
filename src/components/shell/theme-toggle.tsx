"use client";

import * as React from "react";
import { cn } from "cn";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { THEME_COOKIE, preferenceCookie, type ThemePref } from "@/lib/theme";

// Переключатель темы: «Как на устройстве» / светлая / тёмная. Группа радиокнопок —
// стрелки переключают, Tab уходит дальше (нативное поведение radio).
const OPTIONS: { value: ThemePref; label: string; hint?: string; icon: LucideIcon }[] = [
  { value: "system", label: "Авто", hint: "как на устройстве", icon: Monitor },
  { value: "light", label: "Светлая", icon: Sun },
  { value: "dark", label: "Тёмная", icon: Moon },
];

/** Тема применяется сразу (атрибут на <html>) и запоминается в cookie для серверного рендеринга. */
function applyTheme(value: ThemePref) {
  document.documentElement.dataset.theme = value;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = preferenceCookie(THEME_COOKIE, value) + secure;
}

export function ThemeToggle({ initial, className }: { initial: ThemePref; className?: string }) {
  const [theme, setTheme] = React.useState(initial);
  const name = React.useId();

  const choose = (value: ThemePref) => {
    setTheme(value);
    applyTheme(value);
  };

  return (
    <fieldset className={cn("flex flex-col gap-2", className)}>
      <legend className="mb-2 text-sm font-medium text-ink-2">Тема</legend>
      <div className="grid grid-cols-3 gap-1 rounded-control bg-surface-2 p-1">
        {OPTIONS.map(({ value, label, hint, icon: Icon }) => (
          <label
            key={value}
            className={cn(
              "relative flex min-h-11 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-control px-1 text-center text-xs font-medium text-ink-2",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
              "has-checked:bg-surface has-checked:text-ink has-checked:shadow-card",
            )}
          >
            <input
              type="radio"
              name={name}
              value={value}
              checked={theme === value}
              onChange={() => choose(value)}
              className="sr-only"
            />
            <Icon aria-hidden className="size-4" />
            {label}
            {hint && <span className="sr-only"> ({hint})</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
