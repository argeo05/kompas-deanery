"use client";

import { MoreLink } from "@/components/ui/more-link";
import { CalendarClock, Megaphone, TriangleAlert } from "lucide-react";
import { Badge, StatusBadge } from "@/components/ui/status-badge";
import { Card, CardLink } from "@/components/ui/card";
import type { HotItem, TodayDTO } from "@/contracts/api";
import { formatDayMonth, formatWhen } from "@/lib/format";

// «Горит» и «Новое» (SPEC §6.2 п.4–5). Не более 3 и 2 элементов.

export function HotList({ items, now }: { items: HotItem[]; now: Date }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="hot-title" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="hot-title" className="type-h2">
          Горит
        </h2>
        <MoreLink href="/study/deadlines" className="-my-3">
          Все дедлайны
        </MoreLink>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) =>
          item.kind === "deadline" ? (
            <li key={item.deadline.id}>
              <Card className="gap-1 p-3">
                <p className="type-body-strong break-words hyphens-auto">{item.deadline.title}</p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 type-caption text-ink-2">
                  <CalendarClock aria-hidden className="size-4" />
                  <span>{formatWhen(item.deadline.dueAt, now)}</span>
                  {item.deadline.courseTitle && <span>· {item.deadline.courseTitle}</span>}
                  {item.deadline.risk && (
                    <Badge tone="warn" icon={TriangleAlert}>
                      Важно для итога
                    </Badge>
                  )}
                </p>
              </Card>
            </li>
          ) : (
            <li key={item.request.id}>
              <Card variant="interactive" className="gap-1 p-3">
                <CardLink href={`/requests/${item.request.id}`} className="type-body-strong">
                  {item.request.type.title}
                </CardLink>
                <StatusBadge
                  kind="request"
                  status={item.request.status}
                  label={
                    item.request.status === "ready"
                      ? "Готова — заберите"
                      : item.request.status === "needs_info"
                        ? "Нужно уточнение"
                        : undefined
                  }
                />
              </Card>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

export function NewsList({ items }: { items: TodayDTO["news"] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="news-title" className="flex flex-col gap-3">
      <h2 id="news-title" className="type-h2">
        Новое от деканата
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((n) => (
          <li key={n.id}>
            <Card className="gap-1 p-3">
              <p className="type-body-strong break-words hyphens-auto">{n.title}</p>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 type-caption text-ink-2">
                <span>{formatDayMonth(n.publishedAt)}</span>
                {n.important && (
                  <Badge tone="warn" icon={Megaphone}>
                    Важно
                  </Badge>
                )}
              </p>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
