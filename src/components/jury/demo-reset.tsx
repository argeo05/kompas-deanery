"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/error-state";
import { sendJson } from "@/lib/send-json";
import { wipeAfterRevokeAll } from "@/lib/offline/sign-out";

// «Сбросить демо-данные» (SPEC §6.12, §6.9 п.6, D-015): возвращает базу к исходному состоянию,
// даты пересчитываются от сегодняшнего дня. Все сеансы закрываются, входить нужно заново.
// Доступно гостю, не чаще раза в 5 минут.

export function DemoReset() {
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const doneRef = React.useRef<HTMLParagraphElement>(null);

  // Нажатая кнопка исчезает вместе с подтверждением: фокус переводим явно.
  React.useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);
  React.useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const res = await sendJson("POST", "/api/demo/reset");
      if (res.status === 429) {
        const body = (await res.json()) as { error?: { details?: { retryAfterSec?: number } } };
        const sec = body.error?.details?.retryAfterSec ?? 300;
        const min = Math.max(1, Math.ceil(sec / 60));
        setError(`Сбросить можно не чаще раза в 5 минут. Попробуйте через ${min} мин.`);
      } else if (!res.ok) {
        setError("Не получилось сбросить. Попробуйте ещё раз через минуту.");
      } else {
        // Сеансы закрыты сервером; личное на устройстве больше не актуально.
        await wipeAfterRevokeAll();
        setDone(true);
      }
    } catch {
      setError("Нет соединения. Проверьте интернет и попробуйте ещё раз.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (done) {
    return (
      <p ref={doneRef} tabIndex={-1} role="status" className="type-body outline-none">
        Готово: демо-данные вернулись к исходным, даты пересчитаны от сегодняшнего дня.{" "}
        {/* Обычная ссылка, не Link: после сброса нужна полная перезагрузка. */}
        <a href="/login">Войти заново</a>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {error && <InlineError>{error}</InlineError>}
      {confirming ? (
        <>
          <p role="alert" className="type-caption text-coral-fg">
            Все изменения в демо-аккаунтах пропадут, и вы выйдете из Компаса.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button ref={confirmRef} variant="danger" loading={busy} onClick={() => void reset()}>
              Сбросить демо-данные
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                queueMicrotask(() => triggerRef.current?.focus());
              }}
            >
              Отмена
            </Button>
          </div>
        </>
      ) : (
        <Button
          ref={triggerRef}
          variant="secondary"
          className="self-start"
          onClick={() => setConfirming(true)}
        >
          Сбросить демо-данные
        </Button>
      )}
    </div>
  );
}
