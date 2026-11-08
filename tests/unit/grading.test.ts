import { describe, expect, it } from "vitest";
import { GRADE_BANDS, MARK_THRESHOLDS } from "@config/grading";
import { markFor, neededFor, totalScore, type Item } from "@/lib/grading";

// DS-03 · Математика оценок (SPEC §6.4, AC-4.2). Тесты готовы, их не менять.
//
// Правила (решение D-003):
// - S = Σ wᵢ·sᵢ/mᵢ·100 по сданным (score ≠ null), округление до 1 знака;
// - neededFor: needed = max(0, T − S), 1 знак; maxPossible = Σ wⱼ·100 по несданным
//   («нужно ещё 18 баллов из 30 доступных»); achievable = needed ≤ maxPossible;
// - markFor: полосы config/grading.ts, нижняя граница включительно. Пороги условные,
//   поэтому тесты шкалы читают конфиг, а не хардкодят числа (кроме примера SPEC «98 / Отлично / A»).

const quiz: Item = { score: 8, max: 10, weight: 0.2 }; // 16
const essay: Item = { score: 15, max: 20, weight: 0.3 }; // 22,5
const examPending: Item = { score: null, max: 100, weight: 0.5 };
const examDone: Item = { score: 72, max: 100, weight: 0.5 }; // 36

describe("totalScore", () => {
  it("ничего не сдано — 0", () => {
    expect(totalScore([{ ...quiz, score: null }, { ...essay, score: null }, examPending])).toBe(0);
    expect(totalScore([])).toBe(0);
  });

  it("часть сдана — несданные не тянут вниз и не добавляют баллов", () => {
    expect(totalScore([quiz, essay, examPending])).toBe(38.5);
  });

  it("всё сдано", () => {
    expect(totalScore([quiz, essay, examDone])).toBe(74.5);
  });

  it("округление до 1 знака", () => {
    expect(totalScore([{ score: 2, max: 3, weight: 1 }])).toBe(66.7);
    expect(totalScore([{ score: 1, max: 3, weight: 1 }])).toBe(33.3);
  });

  it("вес 0 не влияет на итог", () => {
    expect(totalScore([quiz, essay, { score: 0, max: 10, weight: 0 }])).toBe(38.5);
    expect(totalScore([quiz, essay, { score: 10, max: 10, weight: 0 }])).toBe(38.5);
  });

  it("score 0 — сдано на 0, а не «не сдано»", () => {
    expect(totalScore([{ score: 0, max: 10, weight: 0.5 }, examDone])).toBe(36);
  });
});

describe("markFor", () => {
  it("пример SPEC v1.1: 98 / Отлично / A", () => {
    expect(markFor(98)).toEqual({ mark: 5, word: "Отлично", letter: "A" });
  });

  it("нижняя граница каждой полосы включительно, на 0,1 ниже — следующая полоса", () => {
    GRADE_BANDS.forEach((band, i) => {
      expect(markFor(band.min), `S = ${band.min}`).toEqual({
        mark: band.mark,
        word: band.word,
        letter: band.letter,
      });
      const lower = GRADE_BANDS[i + 1];
      if (lower) {
        const below = Math.round((band.min - 0.1) * 10) / 10;
        expect(markFor(below), `S = ${below}`).toEqual({
          mark: lower.mark,
          word: lower.word,
          letter: lower.letter,
        });
      }
    });
  });

  it("пороги оценок 5/4/3 совпадают с MARK_THRESHOLDS", () => {
    for (const mark of [5, 4, 3] as const) {
      expect(markFor(MARK_THRESHOLDS[mark]).mark).toBe(mark);
      expect(markFor(MARK_THRESHOLDS[mark] - 0.1).mark).toBe(mark - 1);
    }
  });

  it("крайние значения 0 и 100", () => {
    expect(markFor(100).mark).toBe(5);
    expect(markFor(0).mark).toBe(2);
  });
});

describe("neededFor", () => {
  it("ничего не сдано: нужно ровно T, доступно 100", () => {
    const items = [{ ...quiz, score: null }, { ...essay, score: null }, examPending];
    expect(neededFor(items, 55)).toEqual({ needed: 55, achievable: true, maxPossible: 100 });
  });

  it("часть сдана: цель достижима", () => {
    expect(neededFor([quiz, essay, examPending], 85)).toEqual({
      needed: 46.5,
      achievable: true,
      maxPossible: 50,
    });
  });

  it("граница: нужно ровно столько, сколько осталось — достижимо", () => {
    expect(neededFor([quiz, essay, examPending], 88.5)).toEqual({
      needed: 50,
      achievable: true,
      maxPossible: 50,
    });
  });

  it("цель недостижима: needed всё равно показывает, сколько не хватает", () => {
    expect(neededFor([quiz, essay, examPending], 90)).toEqual({
      needed: 51.5,
      achievable: false,
      maxPossible: 50,
    });
  });

  it("всё сдано, цель уже набрана — нужно 0", () => {
    expect(neededFor([quiz, essay, examDone], 70)).toEqual({
      needed: 0,
      achievable: true,
      maxPossible: 0,
    });
  });

  it("всё сдано, цель не набрана — недостижима", () => {
    expect(neededFor([quiz, essay, examDone], 85)).toEqual({
      needed: 10.5,
      achievable: false,
      maxPossible: 0,
    });
  });

  it("несданный элемент с весом 0 не даёт доступных баллов", () => {
    const items = [quiz, essay, { score: null, max: 10, weight: 0 }];
    expect(neededFor(items, 30)).toEqual({ needed: 0, achievable: true, maxPossible: 0 });
    expect(neededFor(items, 55)).toEqual({ needed: 16.5, achievable: false, maxPossible: 0 });
  });
});
