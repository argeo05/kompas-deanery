import { Check, TriangleAlert, X } from "lucide-react";
import { Card, CardLink } from "@/components/ui/card";
import { GradeScale } from "@/components/ui/grade-scale";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Badge } from "@/components/ui/status-badge";
import type { GradesDTO } from "@/contracts/api";
import { CONTROL_LABEL } from "./labels";

// Дисциплина в списке «Успеваемость» (SPEC §6.4 п.2). Экзамен — кольцо и оценка тройкой;
// зачёт без оценки — чек-лист условий, а не кольцо (SPEC §6.4 «Тонкости»).

type Course = GradesDTO["courses"][number];

export function CourseRow({ course }: { course: Course }) {
  const isCredit = course.credit !== null;
  return (
    <Card variant="interactive" className="gap-2">
      <div className="flex items-start gap-3">
        {!isCredit && (
          <ProgressRing
            value={course.total}
            max={Math.max(course.maxSoFar, course.total, 1)}
            label={`Набрано ${course.total} из ${course.maxSoFar} баллов, доступных на сегодня`}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <CardLink
            href={`/study/subjects/${course.courseId}`}
            className="text-lg break-words hyphens-auto"
          >
            {course.title}
          </CardLink>
          <p className="text-sm text-ink-2">{CONTROL_LABEL[course.control]}</p>
          {course.mark ? (
            <GradeScale total={course.total} mark={course.mark} />
          ) : (
            !isCredit && <p className="text-base text-ink-2">Оценки пока нет</p>
          )}
          {course.risk && (
            <Badge tone="warn" icon={TriangleAlert}>
              Есть риск
            </Badge>
          )}
          {!isCredit && course.maxSoFar > 0 && (
            <p className="text-sm text-ink-2">
              Набрано {course.total} из {course.maxSoFar} баллов на сегодня
            </p>
          )}
        </div>
      </div>
      {course.credit && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">
            {course.credit.passed === true
              ? "Зачтено"
              : course.credit.passed === false
                ? "Не зачтено"
                : "Условия зачёта"}
          </p>
          <ul className="flex flex-col gap-1">
            {course.credit.conditions.map((c) => (
              <li key={c.label} className="flex items-start gap-2 text-sm">
                {c.met ? (
                  <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-ok" />
                ) : (
                  <X aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-2" />
                )}
                <span>
                  {c.label}
                  <span className="sr-only">{c.met ? ": выполнено" : ": пока не выполнено"}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
