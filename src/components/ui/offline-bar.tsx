"use client";

import * as React from "react";
import { cn } from "cn";
import { WifiOff } from "lucide-react";
import { formatTimeMsk, plural } from "@/lib/format";
import { useOnline, useShownDataAt } from "@/lib/offline/network";
import { usePendingCount } from "@/lib/offline/use-outbox";

// Индикатор сети (SPEC §5.5 п.2, §6.13 п.3): «Нет сети · показаны данные от 08:14».
// Сеть — navigator.onLine и доступность API (network.ts). Время — самые ранние данные на экране.
// Плашка в потоке под шапкой и не перекрывает контент (scroll-padding в globals.css, WCAG 2.4.11).

export { useOnline };

export function OfflineBar({
  dataAt,
  pending,
  forceOffline = false,
  sticky = false,
  className,
}: {
  /** Плашка прилипает под шапкой; тогда scroll-padding учитывает её высоту (globals.css, 2.4.11). */
  sticky?: boolean;
  /** Когда получены показанные данные (ISO). Без него — время данных экрана. */
  dataAt?: string | null;
  /** Сколько действий ждёт отправки. */
  pending?: number;
  /** Для витрины: показать плашку без отключения сети. */
  forceOffline?: boolean;
  className?: string;
}) {
  const online = useOnline();
  const shownAt = useShownDataAt();
  const queued = usePendingCount();
  const waiting = pending ?? queued;
  const offline = forceOffline || !online;
  const at = dataAt ?? (shownAt !== null ? new Date(shownAt).toISOString() : null);
  return (
    // Живой регион есть всегда: так смену состояния озвучат, а не только покажут.
    <div role="status" aria-live="polite" className={className}>
      {offline && (
        <p
          data-slot="offline-bar"
          data-sticky={sticky || undefined}
          className={cn(
            "flex min-h-(--offline-bar-h) items-center justify-center gap-2 bg-ink px-4 py-2 text-center text-sm text-bg",
          )}
        >
          <WifiOff aria-hidden className="size-4 shrink-0" />
          <span>
            Нет сети
            {at
              ? ` · показаны данные от ${formatTimeMsk(at)}`
              : " · покажем свежие данные, когда связь вернётся"}
            {waiting > 0 &&
              ` · ${waiting} ${plural(waiting, ["действие ждёт", "действия ждут", "действий ждут"])} отправки`}
          </span>
        </p>
      )}
    </div>
  );
}
