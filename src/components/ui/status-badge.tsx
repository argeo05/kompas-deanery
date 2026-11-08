import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import {
  CheckCheck,
  CircleCheck,
  CircleSlash,
  CircleX,
  Inbox,
  LoaderCircle,
  MessageCircle,
  OctagonAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { RequestStatus, SemesterStatus } from "@/contracts/api";

// Статус-бейдж (SPEC §7.4, §6.4, §6.5): всегда цвет + иконка + текст (WCAG 1.4.1).
// Цвета — только семантические пары --{tone}-bg / --{tone}-fg из tokens.css.

export const badgeVariants = cva(
  "inline-flex w-fit max-w-full items-center gap-1.5 rounded-2xl px-2.5 py-1 text-sm font-medium [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "bg-neutral-bg text-neutral-fg",
        info: "bg-info-bg text-info-fg",
        ok: "bg-ok-bg text-ok-fg",
        warn: "bg-warn-bg text-warn-fg",
        coral: "bg-coral-bg text-coral-fg",
        alert: "bg-alert-bg text-alert-fg",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

interface StatusMeta {
  label: string;
  tone: BadgeTone;
  icon: LucideIcon;
}

/** Семь статусов заявки (§6.5). Короткие подписи для списков; подробности — в карточке заявки. */
export const REQUEST_STATUS: Record<RequestStatus, StatusMeta> = {
  submitted: { label: "Отправлена", tone: "neutral", icon: Inbox },
  in_progress: { label: "В работе", tone: "info", icon: LoaderCircle },
  needs_info: { label: "Нужно уточнение", tone: "warn", icon: MessageCircle },
  ready: { label: "Готова", tone: "ok", icon: CircleCheck },
  issued: { label: "Выдана", tone: "neutral", icon: CheckCheck },
  rejected: { label: "Отклонена", tone: "coral", icon: CircleX },
  cancelled: { label: "Отменена", tone: "neutral", icon: CircleSlash },
};

/** Три статуса семестра (§6.4): светофор без красного цвета-паники. */
export const SEMESTER_STATUS: Record<SemesterStatus, StatusMeta> = {
  ok: { label: "Всё в порядке", tone: "ok", icon: CircleCheck },
  risk: { label: "Есть риски", tone: "warn", icon: TriangleAlert },
  action: { label: "Нужно действовать", tone: "coral", icon: OctagonAlert },
};

type BadgeProps = Omit<React.ComponentProps<"span">, "children"> &
  (
    | { kind: "request"; status: RequestStatus; label?: string }
    | { kind: "semester"; status: SemesterStatus; label?: string }
  );

/** Бейдж статуса заявки или семестра. label — подпись вместо стандартной (например, «Готова · забрать»). */
export function StatusBadge({ kind, status, label, className, ...props }: BadgeProps) {
  const meta = kind === "request" ? REQUEST_STATUS[status] : SEMESTER_STATUS[status];
  const Icon = meta.icon;
  return (
    <span
      data-slot="status-badge"
      data-status={status}
      className={cn(badgeVariants({ tone: meta.tone }), className)}
      {...props}
    >
      <Icon aria-hidden strokeWidth={2} />
      <span className="min-w-0">{label ?? meta.label}</span>
    </span>
  );
}

/** Произвольная метка (например, «Перенос», «Новое»): тон + иконка + текст. */
export function Badge({
  tone,
  icon: Icon,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { tone?: BadgeTone; icon?: LucideIcon }) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props}>
      {Icon && <Icon aria-hidden strokeWidth={2} />}
      <span className="min-w-0">{children}</span>
    </span>
  );
}
