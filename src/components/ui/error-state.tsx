import * as React from "react";
import { cn } from "cn";
import { CircleAlert } from "lucide-react";
import { Illustration } from "./illustrations";

// Ошибка с действием (SPEC §7.4, §7.6): что случилось, почему (если знаем) и что сделать.
// Без действия ошибку не показываем: всегда есть «Повторить» или обходной путь.

/** Ошибка на весь экран или раздел. */
export function ErrorState({
  title,
  children,
  action,
  headingLevel: H = "h2",
  className,
}: {
  title: string;
  children?: React.ReactNode;
  action: React.ReactNode;
  headingLevel?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <section
      role="alert"
      data-slot="error-state"
      className={cn("flex flex-col items-center gap-3 px-4 py-8 text-center", className)}
    >
      <Illustration name="error" />
      <H className="text-xl font-semibold">{title}</H>
      {children && <div className="max-w-sm text-base text-ink-2">{children}</div>}
      <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>
    </section>
  );
}

/** Ошибка внутри карточки или формы: строка с иконкой и действием справа (или снизу на узком экране). */
export function InlineError({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      data-slot="inline-error"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control bg-alert-bg p-3 text-ink",
        className,
      )}
    >
      <CircleAlert aria-hidden className="size-5 shrink-0 text-alert-fg" />
      <p className="min-w-0 flex-1 basis-48 text-sm">{children}</p>
      {action}
    </div>
  );
}
