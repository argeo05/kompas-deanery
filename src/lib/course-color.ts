// Цвет дисциплины (SPEC §7.2): детерминированно по course_id, 10 «закладок» --course-0…9.
// Цвет смысла не несёт — только помогает узнать дисциплину глазами.

export const COURSE_COLOR_COUNT = 10;

/** FNV-1a по строке id → индекс 0…9. Один и тот же курс всегда получает один цвет. */
export function courseColorIndex(courseId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < courseId.length; i++) {
    h ^= courseId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % COURSE_COLOR_COUNT;
}

// Полные имена классов: Tailwind собирает только то, что видит в исходниках целиком.
const BG = [
  "bg-course-0",
  "bg-course-1",
  "bg-course-2",
  "bg-course-3",
  "bg-course-4",
  "bg-course-5",
  "bg-course-6",
  "bg-course-7",
  "bg-course-8",
  "bg-course-9",
] as const;

/** Класс фона для полосы или точки дисциплины. */
export function courseColorClass(courseId: string): (typeof BG)[number] {
  return BG[courseColorIndex(courseId)];
}

export const COURSE_COLOR_CLASSES = BG;
