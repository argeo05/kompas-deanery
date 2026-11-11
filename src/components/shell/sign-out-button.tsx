"use client";

import * as React from "react";
import { LogOut } from "lucide-react";
import { cn } from "cn";
import { plural } from "@/lib/format";
import { signOut } from "@/lib/offline/sign-out";
import { usePendingCount } from "@/lib/offline/use-outbox";

// «Выйти» (SPEC §6.1, §6.13 п.5, AC-13.4): стирает данные на устройстве и закрывает сессию.
// Если в очереди есть неотправленные действия, сначала честно предупреждаем: они пропадут.
export function SignOutButton({ className }: { className?: string }) {
  const pending = usePendingCount();
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const warnId = React.useId();

  async function onClick() {
    if (pending > 0 && !confirming) {
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
      {confirming && (
        <p id={warnId} role="alert" className="type-caption text-coral-fg">
          {pending}{" "}
          {plural(pending, [
            "действие ещё не отправлено",
            "действия ещё не отправлены",
            "действий ещё не отправлено",
          ])}
          . После выхода {plural(pending, ["оно удалится", "они удалятся", "они удалятся"])}.
        </p>
      )}
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={busy}
        aria-describedby={confirming ? warnId : undefined}
        className="flex min-h-11 w-full items-center gap-3 rounded-control px-2.5 py-2 text-left type-nav text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-60"
      >
        <LogOut aria-hidden strokeWidth={1.75} className="size-5 shrink-0" />
        {confirming ? "Всё равно выйти" : "Выйти"}
      </button>
    </div>
  );
}
