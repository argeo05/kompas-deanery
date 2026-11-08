import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { StatusBadge } from "@/components/ui/status-badge";
import type { GradesDTO } from "@/contracts/api";
import { plural } from "@/lib/format";
import { REASON_LABEL } from "./labels";

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
  const titles = new Map(grades.courses.map((c) => [c.courseId, c.title]));
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
                <Link href={`/study/subjects/${r.courseId}`} className="type-body-strong">
                  {titles.get(r.courseId) ?? "Дисциплина"}
                </Link>
                : {REASON_LABEL[r.reason]}
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
          value={grades.averagePreliminary === null ? "—" : grades.averagePreliminary.toFixed(1)}
          hint="предварительно"
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
