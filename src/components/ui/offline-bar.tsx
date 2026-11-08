"use client";

import * as React from "react";
import { cn } from "cn";
import { WifiOff } from "lucide-react";
import { formatTimeMsk } from "@/lib/format";

// Индикатор сети (SPEC §5.5 п.2, §6.13): при офлайне — плашка «Нет сети · показаны данные от 08:14».
// Время последних данных передаёт экран (или service worker в C7); без него — общий текст.

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

export function OfflineBar({
  dataAt,
  forceOffline = false,
  sticky = false,
  className,
}: {
  /** Плашка прилипает под шапкой; тогда scroll-padding учитывает её высоту (globals.css, 2.4.11). */
  sticky?: boolean;
  /** Когда получены показанные данные (ISO). */
  dataAt?: string | null;
  /** Для витрины: показать плашку без отключения сети. */
  forceOffline?: boolean;
  className?: string;
}) {
  const online = useOnline();
  const offline = forceOffline || !online;
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
            {dataAt
              ? ` · показаны данные от ${formatTimeMsk(dataAt)}`
              : " · покажем свежие данные, когда связь вернётся"}
          </span>
        </p>
      )}
    </div>
  );
}
