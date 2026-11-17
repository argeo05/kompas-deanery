import type { ControlType, GradesDTO, SemesterStatusReason } from "@/contracts/api";
import { formatNeedShare } from "@/lib/format";

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

/**
 * Причина в сводке с цифрой из того же расчёта, что «Что поможет» на странице дисциплины:
 * «нужно набрать 87% оставшихся баллов», а не общее «больше 70%».
 */
export function reasonText(
  reason: SemesterStatusReason,
  course: GradesDTO["courses"][number] | undefined,
): string {
  if (reason !== "NEED_OVER_70" || !course) return REASON_LABEL[reason];
  const goal = course.control === "credit" ? "«зачтено»" : "«удовлетворительно»";
  const share = course.passNeedShare;
  if (share === null) return `до ${goal} не хватает баллов, а работ больше нет`;
  if (share > 1) return `оставшихся работ не хватит до ${goal} — поговорите с преподавателем`;
  return `для ${goal} нужно набрать ${formatNeedShare(share)} оставшихся баллов`;
}

/** «2026-1» → «2026/27, 1 семестр». Формат семестра условный, как в сиде. */
export function semesterLabel(semester: string): string {
  const [year, index] = semester.split("-");
  const y = Number(year);
  if (!y || !index) return semester;
  return `${y}/${String(y + 1).slice(2)}, ${index} семестр`;
}
