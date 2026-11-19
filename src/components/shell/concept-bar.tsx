import Link from "next/link";
import { Info } from "lucide-react";

// Полоса концепта (SPEC §5.5 п.1, §7.3): тонкая полоса сверху каждой страницы, фон --surface-2,
// текст --ink-2, иконка info. На мобильной — короткий текст, полный остаётся в футере (C-19).
// Вся полоса ведёт на /about. При увеличении шрифта текст занимает несколько строк.
export const CONCEPT_TEXT =
  "Концепт для MGIMO AI Challenge · не официальный сервис · данные вымышленные";

export function ConceptBar() {
  return (
    <Link
      href="/about"
      data-slot="concept-bar"
      className="flex min-h-(--concept-bar-h) items-center justify-center bg-surface-2 px-2 py-0.5 text-center text-xs text-ink-2 no-underline hover:text-ink"
    >
      <span className="min-w-0 [overflow-wrap:anywhere]">
        <Info aria-hidden className="me-1 inline-block size-4 align-text-bottom" />
        <span className="lg:hidden">Концепт · данные вымышленные</span>
        <span className="hidden lg:inline">{CONCEPT_TEXT}</span>{" "}
        <span className="underline">Подробнее</span>
      </span>
    </Link>
  );
}
