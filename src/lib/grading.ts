import { GRADE_BANDS } from "../../config/grading";
import type { MarkDTO } from "@/contracts/api";

// DS-03. Математика оценок (SPEC §6.4, AC-4.2). Пороги — config/grading.ts. Тесты: tests/unit/grading.test.ts.

/** Элемент контроля. score null — ещё не сдано. */
export interface Item {
  score: number | null;
  max: number;
  weight: number;
}

/** Округление до 1 знака после запятой. */
const round1 = (v: number): number => Math.round(v * 10) / 10;

/** Итог S = Σ wᵢ·sᵢ/mᵢ·100 по сданным элементам, 1 знак после запятой. */
export function totalScore(items: Item[]): number {
  let sum = 0;
  for (const { score, max, weight } of items) {
    if (score === null) continue;
    sum += ((weight * score) / max) * 100;
  }
  return round1(sum);
}

/** Оценка по итогу S: { mark, word, letter } из config/grading.ts. */
export function markFor(total: number): { mark: MarkDTO["value"]; word: string; letter: string } {
  const band = GRADE_BANDS.find((b) => total >= b.min) ?? GRADE_BANDS[GRADE_BANDS.length - 1]!;
  return { mark: band.mark, word: band.word, letter: band.letter };
}

/**
 * Сколько нужно набрать на несданных элементах до итога targetTotal.
 * needed — баллы итога S (≥ 0, 1 знак), maxPossible — сколько ещё можно набрать: Σ wⱼ·100 по несданным.
 */
export function neededFor(
  items: Item[],
  targetTotal: number,
): { needed: number; achievable: boolean; maxPossible: number } {
  const current = totalScore(items);
  const needed = round1(Math.max(0, targetTotal - current));
  const maxPossible = round1(
    items.reduce((sum, it) => (it.score === null ? sum + it.weight * 100 : sum), 0),
  );
  return { needed, achievable: needed <= maxPossible, maxPossible };
}

/**
 * Доля оставшихся баллов до цели: 0,87 → «87% оставшихся». Одна формула для сводки «Учёбы»,
 * «Что поможет» и стартовых значений «Что если» (C11: раньше там было три разных ответа).
 * null — цель уже набрана или несданных элементов нет; больше 1 — цель не набрать.
 */
export function needShare(items: Item[], targetTotal: number): number | null {
  const { needed, maxPossible } = neededFor(items, targetTotal);
  if (needed === 0 || maxPossible === 0) return null;
  return Math.round((needed / maxPossible) * 1000) / 1000;
}
