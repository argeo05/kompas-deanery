import { Check, TriangleAlert, X } from "lucide-react";
import { Card, CardLink } from "@/components/ui/card";
import { GradeScale } from "@/components/ui/grade-scale";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Badge } from "@/components/ui/status-badge";
import type { GradesDTO } from "@/contracts/api";
import { formatScore } from "@/lib/format";
import { CONTROL_LABEL } from "./labels";

// Дисциплина в списке «Успеваемость» (SPEC §6.4 п.2). Экзамен — кольцо и оценка тройкой;
// зачёт без оценки — чек-лист условий, а не кольцо (SPEC §6.4 «Тонкости»).

type Course = GradesDTO["courses"][number];

export function CourseRow({ course }: { course: Course }) {
  const isCredit = course.credit !== null;
  return (
    <Card variant="interactive" className="gap-2">
      <div className="flex flex-wrap items-start gap-3">
        {!isCredit && (
          <ProgressRing
            value={course.total}
            max={Math.max(course.maxSoFar, course.total, 1)}
            label={`Набрано ${formatScore(course.total)} из ${formatScore(course.maxSoFar)} баллов, доступных на сегодня`}
          />
        )}
        <div className="flex min-w-0 flex-[1_1_8rem] flex-col gap-1">
          <CardLink
            href={`/study/subjects/${course.courseId}`}
            className="type-h3 break-words hyphens-auto"
          >
            {course.title}
          </CardLink>
          <p className="type-caption text-ink-2">{CONTROL_LABEL[course.control]}</p>
          {!course.mark && !isCredit && <p className="type-body text-ink-2">Оценки пока нет</p>}
          {course.risk && (
            <Badge tone="warn" icon={TriangleAlert}>
              Есть риск
            </Badge>
          )}
          {!isCredit && course.maxSoFar > 0 && (
            <p className="type-caption text-ink-2">
              Набрано {formatScore(course.total)} из {formatScore(course.maxSoFar)} баллов на
              сегодня
            </p>
          )}
        </div>
        {course.mark && (
          <GradeScale total={course.total} mark={course.mark} className="ml-auto shrink-0" />
        )}
      </div>
      {course.credit && (
        <div className="flex flex-col gap-1.5">
          <p className="type-body-strong">
            {course.credit.passed === true
              ? "Зачтено"
              : course.credit.passed === false
                ? "Не зачтено"
                : "Условия зачёта"}
          </p>
          <ul className="flex flex-col gap-1">
            {course.credit.conditions.map((c) => (
              <li key={c.label} className="flex items-start gap-2 type-caption">
                {c.met ? (
                  <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-ok" />
                ) : (
                  <X aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-2" />
                )}
                <span className="wrap-anywhere">
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
