import { describe, expect, it } from "vitest";
import { COURSE_COLOR_CLASSES, courseColorClass } from "@/lib/course-color";

describe("цвет дисциплины", () => {
  it("берётся из colorIndex API, а не вычисляется по id", () => {
    for (let i = 0; i < 10; i++) expect(courseColorClass(i)).toBe(`bg-course-${i}`);
  });

  it("индекс вне 0…9 даёт нейтральный цвет", () => {
    expect(courseColorClass(-1)).toBe("bg-course-9");
    expect(courseColorClass(10)).toBe("bg-course-9");
    expect(courseColorClass(1.5)).toBe("bg-course-9");
    expect(COURSE_COLOR_CLASSES).toHaveLength(10);
  });
});
