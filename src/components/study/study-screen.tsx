"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ApiView } from "@/components/screens/api-view";
import { useStudent } from "@/components/shell/student-context";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingRegion, Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import type { GradesDTO } from "@/contracts/api";
import { useApi } from "@/lib/use-api";
import { CourseRow } from "./course-row";
import { DeadlinesBlock } from "./deadlines-block";
import { semesterLabel } from "./labels";
import { SemesterSummary } from "./semester-summary";
import { StudyTabs } from "./study-tabs";

// Экран «Учёба» → «Успеваемость» (SPEC §6.4, §7.5): сводка со статусом, список дисциплин, дедлайны.

function StudySkeleton() {
  return (
    <LoadingRegion label="Загружаем успеваемость…">
      <SkeletonCard className="h-48" />
      <Skeleton className="mt-2 h-6 w-1/3" />
      <SkeletonCard />
      <SkeletonCard />
    </LoadingRegion>
  );
}

export function StudyScreen() {
  const { userId } = useStudent();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const semester = params.get("semester");
  const api = useApi<GradesDTO>(
    semester ? `/api/me/grades?semester=${encodeURIComponent(semester)}` : "/api/me/grades",
    { scope: userId },
  );

  return (
    <>
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold lg:text-3xl">Учёба</h1>
        <StudyTabs />
      </header>
      <ApiView api={api} skeleton={<StudySkeleton />}>
        {(grades) => (
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:items-start lg:gap-8">
            <div className="flex min-w-0 flex-col gap-4">
              {grades.semesters.length > 1 && (
                <label className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
                  Семестр
                  <select
                    value={grades.semester}
                    onChange={(e) =>
                      router.push(`${pathname}?semester=${e.target.value}`, { scroll: false })
                    }
                    className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-base text-ink"
                  >
                    {grades.semesters.map((s) => (
                      <option key={s} value={s}>
                        {semesterLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {grades.courses.length === 0 ? (
                <EmptyState illustration="nothing-found" title="Оценок пока нет">
                  Как только появятся первые баллы за семестр, они будут здесь.
                </EmptyState>
              ) : (
                <>
                  <SemesterSummary grades={grades} />
                  <section aria-labelledby="courses-title" className="flex flex-col gap-3">
                    <h2 id="courses-title" className="text-xl font-semibold">
                      Дисциплины
                    </h2>
                    <ul className="flex flex-col gap-2">
                      {grades.courses.map((c) => (
                        <li key={c.courseId}>
                          <CourseRow course={c} />
                        </li>
                      ))}
                    </ul>
                  </section>
                </>
              )}
            </div>
            <DeadlinesBlock />
          </div>
        )}
      </ApiView>
    </>
  );
}
