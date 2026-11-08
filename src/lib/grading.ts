import type { MarkDTO } from "@/contracts/api";
import { notImplemented } from "./not-implemented";

// DS-03. Математика оценок (SPEC §6.4, AC-4.2). Пороги — config/grading.ts. Тесты: tests/unit/grading.test.ts.

/** Элемент контроля. score null — ещё не сдано. */
export interface Item {
  score: number | null;
  max: number;
  weight: number;
}

/** Итог S = Σ wᵢ·sᵢ/mᵢ·100 по сданным элементам, 1 знак после запятой. */
export function totalScore(items: Item[]): number {
  return notImplemented("DS-03", items);
}

/** Оценка по итогу S: { mark, word, letter } из config/grading.ts. */
export function markFor(total: number): { mark: MarkDTO["value"]; word: string; letter: string } {
  return notImplemented("DS-03", total);
}

/**
 * Сколько нужно набрать на несданных элементах до итога targetTotal.
 * needed — баллы итога S (≥ 0, 1 знак), maxPossible — сколько ещё можно набрать: Σ wⱼ·100 по несданным.
 */
export function neededFor(
  items: Item[],
  targetTotal: number,
): { needed: number; achievable: boolean; maxPossible: number } {
  return notImplemented("DS-03", items, targetTotal);
}
