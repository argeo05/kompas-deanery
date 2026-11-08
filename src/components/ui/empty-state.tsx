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
  /** Эмодзи внутри оборачивайте в <span aria-hidden> — читалка не должна их произносить. */
  title: React.ReactNode;
  children?: React.ReactNode;
  /** Кнопка или ссылка: что сделать дальше. */
  action?: React.ReactNode;
  headingLevel?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <section
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center gap-3 rounded-card bg-surface paper-ruled px-4 py-8 text-center",
        className,
      )}
    >
      <Illustration name={illustration} />
      <H className="type-h2">{title}</H>
      {children && <div className="max-w-sm type-body text-ink-2">{children}</div>}
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </section>
  );
}
