"use client";

import * as React from "react";
import { cn } from "cn";
import { Wifi, WifiOff } from "lucide-react";
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
  const barRef = React.useRef<HTMLParagraphElement>(null);
  const [restored, setRestored] = React.useState(false);
  const wasOffline = React.useRef(offline);

  // Сеть вернулась — на несколько секунд «Связь восстановлена»: иначе читалка услышит только тишину.
  React.useEffect(() => {
    const was = wasOffline.current;
    wasOffline.current = offline;
    if (offline || !was) return;
    setRestored(true);
    const id = window.setTimeout(() => setRestored(false), 4000);
    return () => window.clearTimeout(id);
  }, [offline]);

  // Длинный текст на 360 px переносится в 2–3 строки: scroll-padding берёт настоящую высоту (2.4.11).
  React.useEffect(() => {
    const el = barRef.current;
    if (!sticky || !offline || !el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() =>
      root.style.setProperty("--offline-bar-actual", `${el.offsetHeight}px`),
    );
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--offline-bar-actual");
    };
  }, [sticky, offline]);

  return (
    // Живой регион есть всегда: так смену состояния озвучат, а не только покажут.
    <div role="status" aria-live="polite" className={className}>
      {offline && (
        <p
          ref={barRef}
          data-slot="offline-bar"
          data-sticky={sticky || undefined}
          className={cn(
            "flex min-h-(--offline-bar-h) items-center justify-center gap-2 bg-ink px-4 py-2 text-center text-sm hyphens-none text-bg",
          )}
        >
          <WifiOff aria-hidden className="size-4 shrink-0" />
          <span>
            Нет сети
            {at
              ? ` · показаны данные от ${formatTimeMsk(at)}`
              : " · покажем свежие данные, когда появится сеть"}
            {waiting > 0 &&
              ` · ${waiting}\u00a0${plural(waiting, ["действие ждёт", "действия ждут", "действий ждут"])} отправки`}
          </span>
        </p>
      )}
      {!offline && restored && (
        <p
          data-slot="online-restored"
          className="flex min-h-(--offline-bar-h) items-center justify-center gap-2 bg-ok-bg px-4 py-2 text-center text-sm text-ok-fg"
        >
          <Wifi aria-hidden className="size-4 shrink-0" />
          <span>Связь восстановлена</span>
        </p>
      )}
    </div>
  );
}
