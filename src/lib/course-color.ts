// Цвет дисциплины (SPEC §7.2): индекс 0…9 приходит от API (`course.colorIndex`), клиент его не вычисляет.
// Цвет смысла не несёт — только помогает узнать дисциплину глазами.

export const COURSE_COLOR_COUNT = 10;

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

/** Класс фона для полосы или точки дисциплины по `colorIndex` из API. Вне 0…9 — нейтральный 9 (графит). */
export function courseColorClass(colorIndex: number): (typeof BG)[number] {
  return BG[Number.isInteger(colorIndex) ? colorIndex : -1] ?? BG[COURSE_COLOR_COUNT - 1];
}

export const COURSE_COLOR_CLASSES = BG;
