import { Clock, Hourglass, TriangleAlert } from "lucide-react";
import type { RequestStatus } from "@/contracts/api";
import { Badge } from "@/components/ui/status-badge";
import { formatDayMonth, plural } from "@/lib/format";

// Срок обработки (SLA) в очереди и карточке: просроченное и «горит сегодня» подсвечены
// цветом, иконкой и текстом (WCAG 1.4.1). Завершённые заявки срок не показывают.

const OPEN: ReadonlySet<RequestStatus> = new Set(["submitted", "in_progress", "needs_info"]);

export function SlaBadge({
  dueAt,
  status,
  overdue,
  now,
}: {
  dueAt: string;
  status: RequestStatus;
  overdue: boolean;
  now: number;
}) {
  if (!OPEN.has(status)) {
    return <span className="type-caption text-ink-2">{formatDayMonth(dueAt)}</span>;
  }
  const diff = new Date(dueAt).getTime() - now;
  if (status === "needs_info") {
    // Ход за студентом: срок не «горит» для сотрудника, показываем ожидание нейтрально.
    return (
      <Badge tone="neutral" icon={Hourglass}>
        Ждём студента
      </Badge>
    );
  }
  if (overdue) {
    const days = Math.max(1, Math.round(-diff / 86_400_000));
    return (
      <Badge tone="warn" icon={TriangleAlert}>
        Просрочено на {days} {plural(days, ["день", "дня", "дней"])}
      </Badge>
    );
  }
  if (diff < 86_400_000) {
    return (
      <Badge tone="info" icon={Clock}>
        Срок сегодня
      </Badge>
    );
  }
  return <span className="type-caption text-ink-2">до {formatDayMonth(dueAt)}</span>;
}
