import { describe, expect, it } from "vitest";
import { courseColorClass, courseColorIndex } from "@/lib/course-color";

describe("цвет дисциплины", () => {
  it("детерминирован и лежит в 0…9", () => {
    const id = "6f1c2d3e-0000-4000-8000-000000000001";
    expect(courseColorIndex(id)).toBe(courseColorIndex(id));
    expect(courseColorClass(id)).toMatch(/^bg-course-\d$/);
  });

  it("на сотне id используются все 10 цветов", () => {
    const used = new Set(
      Array.from({ length: 100 }, (_, i) => courseColorIndex(`course-${i}-${i * 7919}`)),
    );
    expect(used.size).toBe(10);
  });
});
