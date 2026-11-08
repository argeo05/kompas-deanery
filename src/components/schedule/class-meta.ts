import {
  Ban,
  CalendarPlus,
  DoorOpen,
  MoveRight,
  UserRoundCog,
  type LucideIcon,
} from "lucide-react";
import type { BadgeTone } from "@/components/ui/status-badge";
import type { ClassDTO, ClassType, ScheduleChangeType } from "@/contracts/api";
import { formatTimeMsk } from "@/lib/format";

// Подписи и правила показа пар (SPEC §6.3). Один источник для «Сегодня» и «Расписания».

export const CLASS_TYPE_LABEL: Record<ClassType, string> = {
  lecture: "Лекция",
  seminar: "Семинар",
  practice: "Практика",
  exam: "Экзамен",
  consultation: "Консультация",
};

interface ChangeMeta {
  /** Текстовая метка (WCAG 1.4.1: цвет не единственный носитель). */
  label: string;
  tone: BadgeTone;
  icon: LucideIcon;
}

export const CHANGE_META: Record<ScheduleChangeType, ChangeMeta> = {
  cancelled: { label: "Отменена", tone: "coral", icon: Ban },
  moved: { label: "Перенесена", tone: "warn", icon: MoveRight },
  room_changed: { label: "Новая аудитория", tone: "warn", icon: DoorOpen },
  teacher_changed: { label: "Другой преподаватель", tone: "info", icon: UserRoundCog },
  added: { label: "Добавлена", tone: "info", icon: CalendarPlus },
};

/** «ауд. 312, корп. 1» */
export function roomText(room: ClassDTO["room"]): string {
  return `ауд. ${room.number}, корп. ${room.building}`;
}

/** «Петров Андрей Викторович» → «Петров А. В.» */
export function shortName(fullName: string): string {
  const [last, ...rest] = fullName.trim().split(/\s+/);
  const initials = rest.map((p) => `${p.charAt(0)}.`).join(" ");
  return initials ? `${last} ${initials}` : (last ?? fullName);
}

/** «09:30–11:00» */
export function timeRange(c: Pick<ClassDTO, "startsAt" | "endsAt">): string {
  return `${formatTimeMsk(c.startsAt)}–${formatTimeMsk(c.endsAt)}`;
}

/** Календарный день пары в Москве: «2026-11-12». */
export function classDate(startsAt: string): string {
  // ISO с поясом +03:00 начинается с московской даты.
  return startsAt.slice(0, 10);
}

/** Пара перенесена на другое время: у неё есть «было» с другим началом. */
export function movedFrom(c: ClassDTO): ClassDTO["change"] {
  return c.change?.type === "moved" && c.change.previous ? c.change : null;
}

/** Одинаковый ли день у двух ISO-времён с поясом. */
export const sameDay = (a: string, b: string) => classDate(a) === classDate(b);

/** Пересекаются ли две пары по времени (пары отменённые не считаются). */
export function overlaps(a: ClassDTO, b: ClassDTO): boolean {
  if (a.change?.type === "cancelled" || b.change?.type === "cancelled") return false;
  return (
    Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(b.startsAt) < Date.parse(a.endsAt)
  );
}
