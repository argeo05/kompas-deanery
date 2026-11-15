import * as React from "react";
import { cn } from "cn";
import { Radio } from "lucide-react";
import { Card, CardLink } from "@/components/ui/card";
import { CourseBookmark } from "@/components/ui/course-bookmark";
import { Badge } from "@/components/ui/status-badge";
import type { ClassDTO } from "@/contracts/api";
import { formatTimeMsk, formatWeekdayShort, formatDayMonth } from "@/lib/format";
import {
  CHANGE_META,
  CLASS_TYPE_LABEL,
  roomText,
  shortName,
  sameDay,
  timeRange,
} from "./class-meta";

// Карточка пары (SPEC §6.3, §7.5 ClassCard): полоса цвета дисциплины, время, название, аудитория,
// изменение с текстовой меткой. Цвет дисциплины смысла не несёт — только помогает узнать пару.

/** Строки «было → стало» для изменения. Метка с иконкой выводится отдельно (WCAG 1.4.1). */
export function ChangeNote({ cls }: { cls: ClassDTO }) {
  const change = cls.change;
  if (!change) return null;
  const meta = CHANGE_META[change.type];
  const prev = change.previous;
  let detail: React.ReactNode = null;
  switch (change.type) {
    case "cancelled":
      detail = change.reason ? `Причина: ${change.reason}` : null;
      break;
    case "moved":
      if (prev) {
        detail = sameDay(prev.startsAt, cls.startsAt) ? (
          <>
            <span aria-hidden>
              {formatTimeMsk(prev.startsAt)} → {formatTimeMsk(cls.startsAt)}
            </span>
            <span className="sr-only">
              с {formatTimeMsk(prev.startsAt)} на {formatTimeMsk(cls.startsAt)}
            </span>
          </>
        ) : (
          `Перенесена с ${formatWeekdayShort(prev.startsAt)}, ${formatDayMonth(prev.startsAt)} ${formatTimeMsk(prev.startsAt)}`
        );
      }
      break;
    case "room_changed":
      detail = prev ? `Была аудитория ${prev.roomNumber}` : null;
      break;
    case "teacher_changed":
      detail = `Ведёт ${shortName(cls.teacher.fullName)}`;
      break;
    case "added":
      detail = change.reason;
      break;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Badge tone={meta.tone} icon={meta.icon}>
        {meta.label}
      </Badge>
      {detail && <span className="type-caption text-ink">{detail}</span>}
    </div>
  );
}

export function ClassCard({
  cls,
  href,
  state = "upcoming",
  compact = false,
  showDate = false,
  className,
}: {
  cls: ClassDTO;
  /** Куда ведёт карточка: лист с подробностями пары. */
  href: string;
  /** Идёт сейчас / уже прошла / впереди. Прошедшая приглушена, но читается (контраст ≥ 4,5:1). */
  state?: "now" | "past" | "upcoming";
  compact?: boolean;
  showDate?: boolean;
  className?: string;
}) {
  const cancelled = cls.change?.type === "cancelled";
  const changed = cls.change !== null;
  return (
    <Card
      variant={changed && !cancelled ? "highlight" : "interactive"}
      className={cn(
        "flex-row gap-3",
        compact ? "p-3 pl-7" : "p-4 pl-7",
        changed &&
          "has-[.card-link:focus-visible]:outline-2 has-[.card-link:focus-visible]:outline-offset-2 has-[.card-link:focus-visible]:outline-focus",
        className,
      )}
    >
      <CourseBookmark colorIndex={cls.course.colorIndex} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 type-caption text-ink-2">
          {showDate && (
            <span>
              {formatWeekdayShort(cls.startsAt)}, {formatDayMonth(cls.startsAt)}
            </span>
          )}
          <time className="type-num text-ink">{timeRange(cls)}</time>
          <span>{CLASS_TYPE_LABEL[cls.type]}</span>
          {compact && (
            <span className={cn(cls.change?.type === "room_changed" && "font-semibold text-ink")}>
              · {roomText(cls.room)}
            </span>
          )}
          {state === "now" && (
            <Badge tone="info" icon={Radio}>
              Сейчас
            </Badge>
          )}
        </p>
        <CardLink
          href={href}
          className={cn(
            "break-words hyphens-auto",
            compact ? "type-body-strong" : "type-h3",
            cancelled && "line-through decoration-2",
            state === "past" && "text-ink-2",
          )}
        >
          {cls.course.title}
        </CardLink>
        {!compact && (
          <p className="type-caption text-ink-2">
            <span className={cn(cls.change?.type === "room_changed" && "font-semibold text-ink")}>
              {roomText(cls.room)}
            </span>
            <span> · {shortName(cls.teacher.fullName)}</span>
          </p>
        )}
        <ChangeNote cls={cls} />
      </div>
    </Card>
  );
}

/** Призрак перенесённой пары на старом месте (SPEC §6.3 п.5): «Перенесена на 15:20». */
export function GhostCard({
  cls,
  originalStartsAt,
  movedTo,
}: {
  /** Пара может оказаться вне загруженной недели: тогда название неизвестно. */
  cls?: Pick<ClassDTO, "course"> | null;
  originalStartsAt: string;
  movedTo: string;
}) {
  const otherDay = !sameDay(originalStartsAt, movedTo);
  return (
    <div
      data-slot="ghost-class"
      className="flex gap-3 rounded-card border border-dashed border-line-strong p-3 text-ink-2"
    >
      <span aria-hidden className="w-1 shrink-0 self-stretch rounded-full bg-line-strong" />
      <div className="flex min-w-0 flex-col gap-1 type-caption">
        <p className="tabular">{formatTimeMsk(originalStartsAt)}</p>
        <p className="type-body-strong text-ink-2 line-through">{cls?.course.title ?? "Пара"}</p>
        <p>
          Перенесена на{" "}
          {otherDay
            ? `${formatWeekdayShort(movedTo)}, ${formatDayMonth(movedTo)} ${formatTimeMsk(movedTo)}`
            : formatTimeMsk(movedTo)}
        </p>
      </div>
    </div>
  );
}
