"use client";

import Link from "next/link";
import { MoreLink } from "@/components/ui/more-link";
import { Mail, MessageSquare } from "lucide-react";
import { ApiView } from "@/components/screens/api-view";
import { useStudent } from "@/components/shell/student-context";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { GradeScale } from "@/components/ui/grade-scale";
import { ProgressRing } from "@/components/ui/progress-ring";
import { LoadingRegion, Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import type { CourseGradesDTO } from "@/contracts/api";
import { formatDayMonth, formatNeedShare, formatScore } from "@/lib/format";
import { markFor, needShare, totalScore } from "@/lib/grading";
import { useApi } from "@/lib/use-api";
import { MARK_THRESHOLDS, RISK_NEEDED_SHARE } from "@config/grading";
import { CONTROL_LABEL } from "./labels";
import { WhatIf } from "./what-if";

// Дисциплина (SPEC §6.4 п.3): итог, элементы контроля, история изменений, «что поможет», «что если».

const TARGETS = [5, 4, 3] as const;

type CourseItem = CourseGradesDTO["items"][number];

const gradingOf = (items: CourseItem[]) =>
  items.map((i) => ({ score: i.score, max: i.max, weight: i.weight }));

/** «на экзамене — не меньше 87 из 100» или «в среднем 87% по каждой работе». */
function needLine(share: number, open: CourseItem[]): string {
  const pct = formatNeedShare(share);
  if (open.length === 1) {
    const only = open[0]!;
    const raw = Math.min(only.max, Math.ceil(share * only.max - 1e-9));
    return `${pct} оставшихся баллов — за «${only.title}» не меньше ${formatScore(raw)} из ${formatScore(only.max)}`;
  }
  return `${pct} оставшихся баллов — в среднем по ${pct} от максимума за каждую несданную работу`;
}

function Help({ course }: { course: CourseGradesDTO }) {
  const grading = gradingOf(course.items);
  const open = course.items.filter((i) => i.score === null);
  const lines = TARGETS.map((target) => {
    const band = markFor(MARK_THRESHOLDS[target]);
    const name = `«${band.word}» (${target})`;
    const share = needShare(grading, MARK_THRESHOLDS[target]);
    if (share === null) {
      return totalScore(grading) >= MARK_THRESHOLDS[target]
        ? { target, text: `${name}: уже достаточно.` }
        : { target, text: `${name}: эту оценку уже не получить.` };
    }
    if (share > 1) return { target, text: `${name}: эту оценку уже не получить.` };
    return { target, text: `${name}: нужно набрать ${needLine(share, open)}.` };
  });
  const passShare = needShare(grading, MARK_THRESHOLDS[3]);
  const needsHelp =
    passShare !== null
      ? passShare > RISK_NEEDED_SHARE
      : totalScore(grading) < MARK_THRESHOLDS[3] && open.length === 0;
  return (
    <section aria-labelledby="help-title" className="flex flex-col gap-3">
      <h2 id="help-title" className="type-h2">
        Что поможет
      </h2>
      <ul className="flex flex-col gap-1.5 type-body">
        {lines.map((l) => (
          <li key={l.target}>{l.text}</li>
        ))}
      </ul>
      {needsHelp && (
        <div className="flex flex-col gap-2">
          {course.teacher.officeHours && (
            <p className="type-body">Ближайшая консультация: {course.teacher.officeHours}.</p>
          )}
          {course.teacher.email && (
            <a
              href={`mailto:${course.teacher.email}`}
              className={buttonVariants({ variant: "secondary" }) + " self-start"}
            >
              <Mail aria-hidden />
              Написать преподавателю
            </a>
          )}
        </div>
      )}
    </section>
  );
}

function Content({ course }: { course: CourseGradesDTO }) {
  const maxById = new Map(course.items.map((i) => [i.id, i]));
  // Знаменатель «на сегодня» — как в списке дисциплин (maxSoFar): вес сданных работ × 100.
  const soFar =
    Math.round(course.items.reduce((s, i) => (i.score !== null ? s + i.weight * 100 : s), 0) * 10) /
    10;
  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:items-start lg:gap-8">
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          {course.mark ? (
            <GradeScale total={course.total} mark={course.mark} variant="card" />
          ) : (
            <div className="flex items-center gap-3">
              <ProgressRing
                value={course.total}
                max={Math.max(soFar, course.total, 1)}
                label={`Набрано ${formatScore(course.total)} из ${formatScore(soFar)} баллов, доступных на сегодня`}
              />
              <div className="flex flex-col">
                <p className="type-body-strong">Итоговой оценки пока нет</p>
                <p className="type-caption text-ink-2">
                  Набрано {formatScore(course.total)} из {formatScore(soFar)} баллов на сегодня.
                  Итог считается из 100: ещё {formatScore(100 - soFar)} баллов будут за несданные
                  работы.
                </p>
              </div>
            </div>
          )}
          <p className="type-caption text-ink-2">
            {CONTROL_LABEL[course.control]} · {course.teacher.fullName}
          </p>
          {course.teacher.officeHours && (
            <p className="type-caption text-ink-2">Консультации: {course.teacher.officeHours}</p>
          )}
          <Link
            href={`/support/new?topic=grades&kind=course&id=${course.courseId}`}
            className={buttonVariants({ variant: "secondary", size: "sm" }) + " self-start"}
          >
            <MessageSquare aria-hidden />
            Написать через Компас
          </Link>
        </Card>

        <section aria-labelledby="items-title" className="flex flex-col gap-3">
          <h2 id="items-title" className="type-h2">
            Работы и баллы
          </h2>
          <ul className="flex flex-col gap-2">
            {course.items.map((i) => (
              <li key={i.id}>
                <Card className="gap-1 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 type-body-strong break-words hyphens-auto">{i.title}</p>
                    <p className="shrink-0 text-base type-num">
                      {i.score === null ? (
                        <span className="font-normal text-ink-2">не сдано</span>
                      ) : (
                        `${formatScore(i.score)} / ${formatScore(i.max)}`
                      )}
                    </p>
                  </div>
                  <p className="type-caption text-ink-2">
                    {i.dueAt ? `Срок: ${formatDayMonth(i.dueAt)} · ` : ""}вес в итоге{" "}
                    {Math.round(i.weight * 100)}%{i.max !== 100 ? ` · максимум ${i.max}` : ""}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <WhatIf items={course.items} passTotal={MARK_THRESHOLDS[3]} />
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <Help course={course} />
        {course.rulesText && (
          <section aria-labelledby="rules-title" className="flex flex-col gap-2">
            <h2 id="rules-title" className="type-h2">
              Как оценивается
            </h2>
            <p className="type-body whitespace-pre-line text-ink-2">{course.rulesText}</p>
          </section>
        )}
        {course.history.length > 0 && (
          <section aria-labelledby="history-title" className="flex flex-col gap-2">
            <h2 id="history-title" className="type-h2">
              История изменений
            </h2>
            <ul className="flex flex-col gap-2 type-caption">
              {course.history.map((h) => {
                const item = maxById.get(h.itemId);
                const max = item?.max ?? "";
                return (
                  <li key={`${h.itemId}-${h.changedAt}`}>
                    {formatDayMonth(h.changedAt)}:{" "}
                    {h.oldScore === null
                      ? `выставлено ${h.newScore}/${max}`
                      : `исправлено с ${h.oldScore} на ${h.newScore}/${max}`}
                    {item ? ` («${item.title}»)` : ""} — {h.changedBy}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

export function SubjectScreen({ courseId }: { courseId: string }) {
  const { userId } = useStudent();
  const api = useApi<CourseGradesDTO>(`/api/me/grades/${encodeURIComponent(courseId)}`, {
    scope: userId,
  });
  return (
    <>
      <header className="flex flex-col gap-2">
        <MoreLink href="/study" back className="-my-2">
          Учёба
        </MoreLink>
        <h1 className="type-h2 break-words hyphens-auto lg:text-3xl">
          {api.data?.title ?? "Дисциплина"}
        </h1>
      </header>
      <ApiView
        api={api}
        skeleton={
          <LoadingRegion label="Загружаем дисциплину…">
            <SkeletonCard />
            <Skeleton className="h-6 w-1/3" />
            <SkeletonCard />
          </LoadingRegion>
        }
        notFound={
          <EmptyState
            illustration="nothing-found"
            title="Такой дисциплины у вас нет"
            action={
              <Link href="/study" className={buttonVariants({ variant: "secondary" })}>
                Вернуться к списку дисциплин
              </Link>
            }
          >
            Ссылка могла устареть. Откройте дисциплину из списка.
          </EmptyState>
        }
      >
        {(course) => <Content course={course} />}
      </ApiView>
    </>
  );
}
