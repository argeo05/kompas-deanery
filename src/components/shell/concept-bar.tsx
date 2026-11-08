import Link from "next/link";
import { Info } from "lucide-react";

// Полоса концепта (SPEC §5.5 п.1, §7.3): тонкая полоса сверху каждой страницы, фон --surface-2,
// текст --ink-2, иконка info. На мобильной — короткий текст, полный остаётся в футере (C-19).
// Вся полоса — одна ссылка на /about: цель касания на всю ширину (высота 32 px, D-007).
export const CONCEPT_TEXT =
  "Концепт для MGIMO AI Challenge · не официальный сервис · данные вымышленные";

export function ConceptBar() {
  return (
    <Link
      href="/about"
      data-slot="concept-bar"
      className="flex h-(--concept-bar-h) items-center justify-center gap-1.5 bg-surface-2 px-4 text-xs text-ink-2 no-underline hover:text-ink"
    >
      <Info aria-hidden className="size-4 shrink-0" />
      <span className="lg:hidden">Концепт · данные вымышленные</span>
      <span className="hidden lg:inline">{CONCEPT_TEXT}</span>
      <span className="underline">Подробнее</span>
    </Link>
  );
}
