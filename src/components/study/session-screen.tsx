"use client";

import { CalendarPlus, CircleCheck, CircleX, CircleHelp } from "lucide-react";
import { ApiView } from "@/components/screens/api-view";
import { useStudent } from "@/components/shell/student-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingRegion, SkeletonCard } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/status-badge";
import type { SessionDTO } from "@/contracts/api";
import { formatDateLong, formatDayMonthFull, formatTimeMsk, formatWhen } from "@/lib/format";
import { downloadIcs } from "@/lib/ics-client";
import { useApi } from "@/lib/use-api";
import { useNow } from "@/lib/use-now";
import { CONTROL_LABEL } from "./labels";
import { StudyTabs } from "./study-tabs";

// Вкладка «Сессия» (SPEC §6.4 п.5): экзамены и зачёты по датам, аудитория, консультация, допуск с причиной.
// Длительность экзамена в данных не хранится: в календарь он попадает как полтора часа.
const EXAM_MINUTES = 90;

function Admission({ item }: { item: SessionDTO["items"][number] }) {
  if (item.admitted === true) {
    return (
      <Badge tone="ok" icon={CircleCheck}>
        Допуск есть
      </Badge>
    );
  }
  if (item.admitted === false) {
    return (
      <div className="flex flex-col gap-1">
        <Badge tone="coral" icon={CircleX}>
          Допуска пока нет
        </Badge>
        {item.admissionReason && <p className="type-caption text-ink">{item.admissionReason}</p>}
      </div>
    );
  }
  return (
    <Badge tone="neutral" icon={CircleHelp}>
      Допуск ещё не определён
    </Badge>
  );
}

export function SessionScreen() {
  const { userId } = useStudent();
  const api = useApi<SessionDTO>("/api/me/session", { scope: userId });
  const now = useNow();
  return (
    <>
      <header className="flex flex-col gap-3">
        <h1 className="type-h1">Учёба</h1>
        <StudyTabs />
      </header>
      <ApiView
        api={api}
        skeleton={
          <LoadingRegion label="Загружаем сессию…">
            <SkeletonCard />
            <SkeletonCard />
          </LoadingRegion>
        }
      >
        {(session) =>
          session.items.length === 0 ? (
            <EmptyState illustration="all-done" title="Расписание сессии пока не опубликовано">
              Даты экзаменов и зачётов появятся здесь, как только их назначат.
            </EmptyState>
          ) : (
            <div className="flex max-w-2xl flex-col gap-4">
              {session.startsOn && session.endsOn && (
                <p className="type-body-strong">
                  Сессия: {formatDayMonthFull(session.startsOn + "T12:00:00+03:00")} —{" "}
                  {formatDayMonthFull(session.endsOn + "T12:00:00+03:00")}
                </p>
              )}
              <ul className="flex flex-col gap-3">
                {session.items.map((item) => (
                  <li key={item.id}>
                    <Card>
                      <CardHeader>
                        <p className="type-caption text-ink-2">{CONTROL_LABEL[item.type]}</p>
                        <h2 className="type-h3 break-words hyphens-auto">{item.courseTitle}</h2>
                      </CardHeader>
                      <CardContent>
                        <p className="type-body">
                          {formatDateLong(item.startsAt)}, {formatTimeMsk(item.startsAt)} · ауд.{" "}
                          {item.room}
                        </p>
                        {item.consultationAt && (
                          <p className="type-caption text-ink-2">
                            Консультация: {formatWhen(item.consultationAt, now)}
                          </p>
                        )}
                        <Admission item={item} />
                      </CardContent>
                      <CardFooter>
                        <Button
                          variant="secondary"
                          aria-label={`Добавить в календарь: ${CONTROL_LABEL[item.type]}, ${item.courseTitle}`}
                          onClick={() =>
                            downloadIcs({
                              id: item.id,
                              title: `${CONTROL_LABEL[item.type]}: ${item.courseTitle}`,
                              startsAt: item.startsAt,
                              endsAt: new Date(
                                Date.parse(item.startsAt) + EXAM_MINUTES * 60_000,
                              ).toISOString(),
                              location: `ауд. ${item.room}`,
                            })
                          }
                        >
                          <CalendarPlus aria-hidden />
                          Добавить в календарь
                        </Button>
                      </CardFooter>
                    </Card>
                  </li>
                ))}
              </ul>
            </div>
          )
        }
      </ApiView>
    </>
  );
}
