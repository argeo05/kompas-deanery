"use client";

import { CalendarClock, TriangleAlert } from "lucide-react";
import { ApiView } from "@/components/screens/api-view";
import { useStudent } from "@/components/shell/student-context";
import { Card } from "@/components/ui/card";
import { LoadingRegion, SkeletonCard } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/status-badge";
import type { DeadlineDTO, DeadlinesDTO } from "@/contracts/api";
import { formatWhen, plural } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useNow } from "@/lib/use-now";

// Ближайшие дедлайны (SPEC §6.7, только чтение): то, что стоит за числом на значке «Учёба».
// Планирование и «отметить сделанным» — этап C5.

function Item({ d, now }: { d: DeadlineDTO; now: Date }) {
  return (
    <li>
      <Card className="gap-1 p-3">
        <p className="type-body-strong break-words hyphens-auto">{d.title}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 type-caption text-ink-2">
          <CalendarClock aria-hidden className="size-4" />
          <span>{formatWhen(d.dueAt, now)}</span>
          {d.courseTitle && <span>· {d.courseTitle}</span>}
          {d.risk && (
            <Badge tone="warn" icon={TriangleAlert}>
              Важно для итога
            </Badge>
          )}
        </p>
      </Card>
    </li>
  );
}

export function DeadlinesBlock() {
  const { userId } = useStudent();
  const api = useApi<DeadlinesDTO>("/api/me/deadlines?status=active", { scope: userId });
  const now = useNow();
  return (
    <section id="deadlines" aria-labelledby="deadlines-title" className="flex flex-col gap-3">
      <h2 id="deadlines-title" className="type-h2">
        Ближайшие дедлайны
      </h2>
      <ApiView
        api={api}
        skeleton={
          <LoadingRegion label="Загружаем дедлайны…">
            <SkeletonCard />
          </LoadingRegion>
        }
      >
        {({ groups }) => {
          const list = [...groups.hot, ...groups.week].slice(0, 5);
          const rest = groups.hot.length + groups.week.length - list.length;
          if (list.length === 0) {
            return <p className="type-body text-ink-2">Горящих дедлайнов нет. Спокойная неделя.</p>;
          }
          return (
            <>
              <ul className="flex flex-col gap-2">
                {list.map((d) => (
                  <Item key={d.id} d={d} now={now} />
                ))}
              </ul>
              {rest > 0 && (
                <p className="type-caption text-ink-2">
                  И ещё {rest} {plural(rest, ["дедлайн", "дедлайна", "дедлайнов"])} на этой неделе.
                </p>
              )}
            </>
          );
        }}
      </ApiView>
    </section>
  );
}
