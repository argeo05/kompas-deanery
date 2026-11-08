import { cn } from "cn";
import { courseColorClass } from "@/lib/course-color";

// Закладка дисциплины (SPEC §7.2a п.1): полоса 4 px цвета --course-N у левого края карточки,
// выходит на 4 px выше её верхнего края, низ вырезан «ласточкиным хвостом». Родитель — `relative`
// и держит отступ слева (pl-7). Цвет смысла не несёт: дисциплина названа текстом.
export function CourseBookmark({
  colorIndex,
  className,
}: {
  colorIndex: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-slot="course-bookmark"
      className={cn(
        "absolute -top-1 bottom-3 left-3 w-1 [clip-path:polygon(0_0,100%_0,100%_100%,50%_calc(100%-4px),0_100%)]",
        courseColorClass(colorIndex),
        className,
      )}
    />
  );
}
