import * as React from "react";
import { cn } from "cn";

// Скелетоны (SPEC §7.4): строка / карточка / круг. Контейнер загрузки помечается aria-busy
// и озвучивается одной фразой, сами скелетоны скрыты от чтения с экрана.

const base =
  "block animate-shimmer bg-linear-to-r from-surface-2 via-line to-surface-2 bg-size-[200%_100%]";

export function Skeleton({
  shape = "line",
  className,
  ...props
}: React.ComponentProps<"span"> & { shape?: "line" | "card" | "circle" }) {
  return (
    <span
      aria-hidden
      data-slot="skeleton"
      className={cn(
        base,
        shape === "line" && "h-4 w-full rounded-full",
        shape === "card" && "h-24 w-full rounded-card",
        shape === "circle" && "size-12 rounded-full",
        className,
      )}
      {...props}
    />
  );
}

/** Обёртка для области, которая грузится: aria-busy и скрытая подпись «Загружаем…». */
export function LoadingRegion({
  label = "Загружаем…",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { label?: string }) {
  return (
    <div aria-busy="true" className={cn("flex flex-col gap-3", className)} {...props}>
      <span role="status" className="sr-only">
        {label}
      </span>
      {children}
    </div>
  );
}

/** Скелетон карточки пары или заявки: полоса, две строки. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex gap-3 rounded-card border border-(--card-border) bg-surface p-4 shadow-card",
        className,
      )}
    >
      <Skeleton className="h-auto w-1 self-stretch" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-5 w-3/5" />
        <Skeleton className="w-4/5" />
        <Skeleton className="w-2/5" />
      </div>
    </div>
  );
}
