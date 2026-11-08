import * as React from "react";
import { cn } from "cn";

// Сцены для пустых состояний (SPEC §7.2 «Иллюстрации», §12.1): SVG кодом, без генератора изображений.
// Измеримый стиль, по которому принимается каждая сцена:
//  - холст 240×160, показ 240×160 px на мобильной, до 320×213 на десктопе;
//  - линия 2, мелкие детали 1,5, скругления round, без градиентов;
//  - цвет: линии `currentColor` = --ink и ОДНА заливка --accent с fill-opacity 0,16 на одном предмете;
//  - один «тетрадный» предмет по центру на базовой линии y = 136, поле ≥ 16 px, без людей и текста;
//  - никакой анимации: постоянного движения в интерфейсе нет (§7.2 «Движение»).
// Декоративные: aria-hidden, смысл несёт подпись пустого состояния.

export type IllustrationName =
  "free-day" | "all-done" | "offline" | "no-requests" | "nothing-found" | "error";

/** Заливка-акцент: единственная на сцену. */
const ACCENT = { className: "fill-accent", fillOpacity: 0.16 } as const;

/** Мелкая деталь: 1,5 вместо 2. */
const FINE = { strokeWidth: 1.5 } as const;

const scenes: Record<IllustrationName, React.ReactNode> = {
  // Свободный день: чашка с паром.
  "free-day": (
    <>
      <path d="M92 84h56v28a24 24 0 0 1-24 24h-8a24 24 0 0 1-24-24z" {...ACCENT} />
      <path d="M148 94h6a12 12 0 0 1 0 24h-8" />
      <path d="M108 70c-4-6 4-10 0-16M124 70c-4-6 4-10 0-16M140 70c-4-6 4-10 0-16" {...FINE} />
    </>
  ),
  // Всё сделано: тетрадь с галочкой.
  "all-done": (
    <>
      <rect x="84" y="40" width="72" height="96" rx="6" {...ACCENT} />
      <path d="M98 40v96" />
      <path d="m111 88 9 9 17-19" />
      <path d="M110 58h30" {...FINE} />
    </>
  ),
  // Нет сети: компас с разорванным кольцом.
  offline: (
    <>
      <circle cx="120" cy="92" r="44" strokeDasharray="6 8" />
      <path d="M120 64 130 92l-10 28-10-28z" {...ACCENT} />
      <path d="M120 52v6M120 126v6M76 92h6M158 92h6" {...FINE} />
    </>
  ),
  // Нет заявок: конверт.
  "no-requests": (
    <>
      <rect x="76" y="72" width="88" height="64" rx="6" />
      <path d="M76 78 120 108l44-30V72H76z" {...ACCENT} />
      <path d="m76 134 34-24M164 134l-34-24" {...FINE} />
    </>
  ),
  // Ничего не найдено: раскрытая чистая тетрадь.
  "nothing-found": (
    <>
      <path d="M120 60c-14-8-30-10-48-6v82c18-4 34-2 48 6z" {...ACCENT} />
      <path d="M120 60c14-8 30-10 48-6v82c-18-4-34-2-48 6z" />
      <path d="M120 60v82" {...FINE} />
    </>
  ),
  // Ошибка: страница с загнутым углом и трещиной.
  error: (
    <>
      <path d="M88 40h48l24 24v72H88z" />
      <path d="M136 40v24h24z" {...ACCENT} />
      <path d="m88 100 16-8 12 12 14-10 14 10 16-8" {...FINE} />
    </>
  ),
};

export function Illustration({ name, className }: { name: IllustrationName; className?: string }) {
  return (
    <svg
      viewBox="0 0 240 160"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-slot="illustration"
      className={cn("h-auto w-60 max-w-full text-ink lg:w-80", className)}
    >
      {scenes[name]}
      {/* Базовая линия сцены. */}
      <path d="M56 136h128" />
    </svg>
  );
}
