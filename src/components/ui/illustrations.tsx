import * as React from "react";
import { cn } from "cn";

// Сцены для пустых состояний (SPEC §7.2 «Иллюстрации»): линейная графика чернилами + одна
// заливка-акцент. Это рабочий набор в едином стиле; финальные сцены (ИИ-генерация и векторизация)
// заменят их без изменения API: <Illustration name="…" />. Декоративные — aria-hidden.

export type IllustrationName =
  "free-day" | "all-done" | "offline" | "no-requests" | "nothing-found" | "error";

const line = "fill-none stroke-ink";
const fillAccent = "fill-info-bg stroke-ink";

const scenes: Record<IllustrationName, React.ReactNode> = {
  // Свободный день: солнце над раскрытой тетрадью.
  "free-day": (
    <>
      <circle cx="80" cy="34" r="14" className={fillAccent} />
      <path
        d="M80 10v6M80 52v6M56 34h6M98 34h6M63 17l4 4M93 47l4 4M63 51l4-4M93 21l4-4"
        className={line}
      />
      <path
        d="M30 70c14-6 30-6 50 0 20-6 36-6 50 0v34c-14-6-30-6-50 0-20-6-36-6-50 0z"
        className={line}
      />
      <path d="M80 70v34M42 80h24M42 88h18M94 80h24M94 88h20" className={line} />
    </>
  ),
  // Всё сделано: лист с галочками.
  "all-done": (
    <>
      <rect x="50" y="14" width="60" height="86" rx="8" className={fillAccent} />
      <path
        d="m60 36 5 5 9-10M60 58l5 5 9-10M60 80l5 5 9-10M82 38h18M82 60h18M82 82h14"
        className={line}
      />
    </>
  ),
  // Нет сети: облако с перечёркиванием.
  offline: (
    <>
      <path
        d="M48 86h62a20 20 0 0 0 0-40 28 28 0 0 0-54-4 22 22 0 0 0-8 44z"
        className={fillAccent}
      />
      <path d="M44 28l76 72" className={line} />
    </>
  ),
  // Нет заявок: пустой лоток.
  "no-requests": (
    <>
      <path d="M36 66l14-38h60l14 38v28a6 6 0 0 1-6 6H42a6 6 0 0 1-6-6z" className={line} />
      <path d="M36 66h26l6 10h24l6-10h26" className={fillAccent} />
    </>
  ),
  // Ничего не найдено: лупа над пустой строкой.
  "nothing-found": (
    <>
      <circle cx="72" cy="50" r="24" className={fillAccent} />
      <path d="m90 68 22 22M40 104h80" className={line} />
      <path d="M64 50h16" className={line} />
    </>
  ),
  // Ошибка: страница с загнутым углом и знаком вопроса.
  error: (
    <>
      <path
        d="M50 14h44l16 16v70a6 6 0 0 1-6 6H50a6 6 0 0 1-6-6V20a6 6 0 0 1 6-6z"
        className={fillAccent}
      />
      <path d="M94 14v16h16M70 54a8 8 0 1 1 12 7c-3 2-4 4-4 7M78 78v1" className={line} />
    </>
  ),
};

export function Illustration({ name, className }: { name: IllustrationName; className?: string }) {
  return (
    <svg
      viewBox="0 0 160 120"
      aria-hidden
      focusable="false"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-auto w-32", className)}
    >
      {scenes[name]}
    </svg>
  );
}
