"use client";

import { CloudOff } from "lucide-react";
import { cn } from "cn";
import { formatUpdatedAgo } from "@/lib/format";
import { useNow } from "@/lib/use-now";

// Метка свежести сохранённых данных (SPEC §6.13): «Нет сети · обновлено 12 мин назад».
// Время — последнего успешного обновления. Живой регион не нужен: о смене сети говорит плашка офлайна.
export function DataFreshness({
  at,
  offline = true,
  className,
}: {
  /** Время последнего успешного обновления, мс. */
  at: number;
  offline?: boolean;
  className?: string;
}) {
  const now = useNow();
  return (
    <p
      data-testid="data-freshness"
      className={cn("inline-flex items-center gap-1.5 type-caption text-ink-2", className)}
    >
      {offline && <CloudOff aria-hidden className="size-4 shrink-0" />}
      <span>
        {offline ? "Нет сети · " : ""}
        {formatUpdatedAgo(at, now)}
      </span>
    </p>
  );
}
