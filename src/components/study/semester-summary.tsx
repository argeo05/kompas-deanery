import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { StatusBadge } from "@/components/ui/status-badge";
import type { GradesDTO } from "@/contracts/api";
import { formatScore, plural } from "@/lib/format";
import { reasonText } from "./labels";

// Сводка семестра (SPEC §6.4, AC-4.1): один из трёх статусов, фраза и причины списком дисциплин.
// Без красного и без слов «двойка», «завал», «отчисление»: принцип «Не стыдим».

function headline(g: GradesDTO): string {
  const n = new Set(g.status.reasons.map((r) => r.courseId)).size;
  switch (g.status.status) {
    case "ok":
      return g.daysToSession !== null
        ? `Идёте хорошо. До сессии ${g.daysToSession} ${plural(g.daysToSession, ["день", "дня", "дней"])}.`
        : "Идёте хорошо.";
    case "risk":
      return `Обратите внимание: ${n} ${plural(n, ["дисциплина", "дисциплины", "дисциплин"])}. Ниже — что поможет.`;
    case "action":
      return `Есть задолженность по ${n} ${plural(n, ["дисциплине", "дисциплинам", "дисциплинам"])}. Расскажем, что делать.`;
  }
}

export function SemesterSummary({ grades }: { grades: GradesDTO }) {
  const byId = new Map(grades.courses.map((c) => [c.courseId, c]));
  const debts = new Set(
    grades.status.reasons.filter((r) => r.reason === "DEBT").map((r) => r.courseId),
  ).size;
  return (
    <Card aria-labelledby="summary-title" role="region" data-status={grades.status.status}>
      <CardHeader className="gap-2">
        <h2 id="summary-title" className="sr-only">
          Итог семестра
        </h2>
        <StatusBadge kind="semester" status={grades.status.status} className="text-base" />
        <p className="type-h2">{headline(grades)}</p>
      </CardHeader>
      {grades.status.reasons.length > 0 && (
        <CardContent>
          <ul className="flex flex-col gap-1.5">
            {grades.status.reasons.map((r) => (
              <li key={`${r.courseId}-${r.reason}`} className="type-body">
                <Link
                  href={`/study/subjects/${r.courseId}`}
                  className="type-body-strong text-accent underline hover:text-accent-hover"
                >
                  {byId.get(r.courseId)?.title ?? "Дисциплина"}
                </Link>
                : {reasonText(r.reason, byId.get(r.courseId))}
              </li>
            ))}
          </ul>
          {grades.status.status === "action" && (
            <p>
              <Link href="/requests">Как оформить пересдачу →</Link>
            </p>
          )}
        </CardContent>
      )}
      <dl className="grid grid-cols-2 gap-3 border-t border-line pt-3 sm:grid-cols-3">
        <Stat
          label="Средний балл"
          value={grades.averagePreliminary === null ? "—" : formatScore(grades.averagePreliminary)}
          hint="из 100, предварительно: по сданным работам"
        />
        <Stat
          label="До сессии"
          value={grades.daysToSession === null ? "—" : String(grades.daysToSession)}
          hint={
            grades.daysToSession === null
              ? "дат пока нет"
              : plural(grades.daysToSession, ["день", "дня", "дней"])
          }
        />
        <Stat label="Задолженности" value={String(debts)} />
      </dl>
    </Card>
  );
}
