import type { ControlType, SemesterStatusReason } from "@/contracts/api";

// Подписи раздела «Учёба». Слова по SPEC §6.4 «Тонкости»: «задолженность», «риск», «что поможет».

export const CONTROL_LABEL: Record<ControlType, string> = {
  exam: "Экзамен",
  credit: "Зачёт",
  graded_credit: "Дифференцированный зачёт",
};

export const REASON_LABEL: Record<SemesterStatusReason, string> = {
  NEED_OVER_70: "для удовлетворительной оценки нужно набрать больше 70% оставшихся баллов",
  MISSED_DEADLINE: "пропущен срок сдачи работы",
  NOT_ADMITTED: "нет допуска к сессии",
  DEBT: "есть академическая задолженность",
};

/** «2026-1» → «2026/27, 1 семестр». Формат семестра условный, как в сиде. */
export function semesterLabel(semester: string): string {
  const [year, index] = semester.split("-");
  const y = Number(year);
  if (!y || !index) return semester;
  return `${y}/${String(y + 1).slice(2)}, ${index} семестр`;
}
