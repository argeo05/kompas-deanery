import { describe, expect, it } from "vitest";
import { reasonText } from "@/components/study/labels";
import type { GradesDTO } from "@/contracts/api";
import { formatNeedShare, formatScore } from "@/lib/format";
import { needShare } from "@/lib/grading";

// C11, раунд 1 (CW-12): «сколько нужно до „удовлетворительно“» — одна формула для сводки «Учёбы»,
// «Что поможет» и стартовых ползунков «Что если». Пример из оценки: Микроэкономика, сдано 11,5
// из 50, экзамен весит 50% → нужно 43,5 из 50 оставшихся = 87%, на экзамене не меньше 87 из 100.

const micro = [
  { score: 1.5, max: 10, weight: 0.25 }, // 3,75
  { score: 7.75, max: 25, weight: 0.25 }, // 7,75
  { score: null, max: 100, weight: 0.5 },
];

const course = (patch: Partial<GradesDTO["courses"][number]>): GradesDTO["courses"][number] => ({
  courseId: "c",
  title: "Микроэкономика",
  control: "exam",
  total: 11.5,
  maxSoFar: 50,
  mark: null,
  credit: null,
  risk: true,
  passNeedShare: 0.87,
  ...patch,
});

describe("needShare", () => {
  it("доля оставшихся баллов до порога", () => {
    expect(needShare(micro, 55)).toBe(0.87);
  });
  it("порог уже набран — null", () => {
    expect(needShare(micro, 10)).toBeNull();
  });
  it("работ не осталось — null", () => {
    expect(needShare([{ score: 50, max: 100, weight: 1 }], 55)).toBeNull();
  });
  it("порог не набрать — больше 1", () => {
    expect(needShare(micro, 85)).toBeGreaterThan(1);
  });
});

describe("тексты", () => {
  it("процент округляется вверх: 86,2% → «87%»", () => {
    expect(formatNeedShare(0.862)).toBe("87%");
    expect(formatNeedShare(0.87)).toBe("87%");
  });
  it("баллы с запятой", () => {
    expect(formatScore(11.5)).toBe("11,5");
    expect(formatScore(24)).toBe("24");
  });
  it("причина в сводке — с той же цифрой, что на странице дисциплины", () => {
    expect(reasonText("NEED_OVER_70", course({}))).toBe(
      "для «удовлетворительно» нужно набрать 87% оставшихся баллов",
    );
    expect(reasonText("NEED_OVER_70", course({ control: "credit" }))).toContain("«зачтено»");
    expect(reasonText("NEED_OVER_70", course({ passNeedShare: 1.2 }))).toContain("не хватит");
    expect(reasonText("NEED_OVER_70", course({ passNeedShare: null }))).toContain(
      "работ больше нет",
    );
    expect(reasonText("DEBT", course({}))).toBe("есть академическая задолженность");
  });
});
