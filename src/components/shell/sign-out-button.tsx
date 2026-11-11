"use client";

import * as React from "react";
import { LogOut } from "lucide-react";
import { cn } from "cn";
import { plural } from "@/lib/format";
import { signOut } from "@/lib/offline/sign-out";
import { useUnsentCount } from "@/lib/offline/use-outbox";

const ROW =
  "flex min-h-11 w-full items-center gap-3 rounded-control px-2.5 py-2 text-left type-nav text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-60";

// «Выйти» (SPEC §6.1, §6.13 п.5, AC-13.4): стирает данные на устройстве и закрывает сессию.
// Если в очереди есть неотправленные действия (ждут сети или не отправились), сначала честно
// предупреждаем: они пропадут. Пока очередь не прочитана, выход ждёт — иначе предупреждение пропустим.
export function SignOutButton({ className }: { className?: string }) {
  const unsent = useUnsentCount();
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const stayRef = React.useRef<HTMLButtonElement>(null);
  const count = unsent ?? 0;
  // Очередь ушла, пока человек думал, — предупреждать больше не о чем.
  const asking = confirming && count > 0;

  React.useEffect(() => {
    if (asking) stayRef.current?.focus();
  }, [asking]);

  async function onClick() {
    if (unsent === null) return;
    if (unsent > 0 && !asking) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    await signOut();
    // Без сети /login откроется офлайн-оболочкой с экраном «Вы вышли».
    window.location.replace("/login");
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {asking && (
        <p role="alert" className="type-caption text-coral-fg">
          {count}{" "}
          {plural(count, [
            "действие ещё не отправлено",
            "действия ещё не отправлены",
            "действий ещё не отправлено",
          ])}
          . После выхода {plural(count, ["оно пропадёт", "они пропадут", "они пропадут"])}.
        </p>
      )}
      {asking && (
        <button ref={stayRef} type="button" onClick={() => setConfirming(false)} className={ROW}>
          Остаться
        </button>
      )}
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={busy}
        aria-busy={busy || undefined}
        className={ROW}
      >
        <LogOut aria-hidden strokeWidth={1.75} className="size-5 shrink-0" />
        {asking ? "Всё равно выйти" : "Выйти"}
      </button>
    </div>
  );
}
