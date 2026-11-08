import * as React from "react";
import { cn } from "cn";
import { Illustration, type IllustrationName } from "./illustrations";

// Пустое состояние (SPEC §7.4): иллюстрация + заголовок + текст + действие.
export function EmptyState({
  illustration,
  title,
  children,
  action,
  headingLevel: H = "h2",
  className,
}: {
  illustration: IllustrationName;
  title: string;
  children?: React.ReactNode;
  /** Кнопка или ссылка: что сделать дальше. */
  action?: React.ReactNode;
  headingLevel?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <section
      data-slot="empty-state"
      className={cn("flex flex-col items-center gap-3 px-4 py-8 text-center", className)}
    >
      <Illustration name={illustration} />
      <H className="text-xl font-semibold">{title}</H>
      {children && <div className="max-w-sm text-base text-ink-2">{children}</div>}
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </section>
  );
}
