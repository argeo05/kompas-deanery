"use client";

import * as React from "react";
import { CalendarPlus, Copy } from "lucide-react";
import { useStudent } from "@/components/shell/student-context";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/error-state";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { IcsUrlDTO } from "@/contracts/api";
import { sendJson } from "@/lib/send-json";
import { useApi } from "@/lib/use-api";

// Подписка на календарь (SPEC §6.3 п.7, §6.9): персональная ссылка ICS для Google Calendar и Apple
// Calendar. Ссылка секретная и отзывается: «Сбросить» выдаёт новую, старая сразу даёт 404.
// Адрес запрашивается только при открытии листа: первый запрос создаёт ссылку.

export function CalendarSubscribe() {
  const { userId } = useStudent();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [rotating, setRotating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const api = useApi<IcsUrlDTO>(open ? "/api/me/ics" : null, { scope: userId });
  const [rotated, setRotated] = React.useState<string | null>(null);
  const url = rotated ?? api.data?.url ?? null;

  React.useEffect(() => {
    if (window.location.hash === "#calendar") queueMicrotask(() => setOpen(true));
  }, []);

  const full = url ? `${window.location.origin}${url}` : "";
  const webcal = full.replace(/^https?:/, "webcal:");

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ tone: "success", title: "Ссылка скопирована" });
    } catch {
      toast({
        tone: "error",
        title: "Не получилось скопировать",
        description: "Выделите ссылку в поле и скопируйте вручную.",
      });
    }
  }

  async function rotate() {
    setRotating(true);
    setError(null);
    try {
      const res = await sendJson("POST", "/api/me/ics/rotate");
      if (!res.ok) throw new Error(String(res.status));
      setRotated(((await res.json()) as IcsUrlDTO).url);
      setConfirming(false);
      toast({
        tone: "success",
        title: "Новая ссылка готова",
        description: "Старая больше не работает.",
      });
    } catch {
      setError("Не получилось сбросить ссылку. Проверьте интернет и попробуйте ещё раз.");
    } finally {
      setRotating(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        id="calendar"
        className="max-w-full whitespace-normal"
        onClick={() => setOpen(true)}
      >
        <CalendarPlus aria-hidden className="size-4" />
        Подписаться на календарь
      </Button>
      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setConfirming(false);
        }}
        title="Календарь в телефоне"
        description="Пары и важные дедлайны появятся в Google Calendar или Apple Calendar и будут обновляться сами."
      >
        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
          {api.loading && !url && <p className="text-ink-2">Готовим ссылку…</p>}
          {api.error && !url && (
            <InlineError>
              Не получилось получить ссылку. Закройте окно и откройте снова.
            </InlineError>
          )}
          {url && (
            <>
              <div className="flex flex-col gap-1">
                <label htmlFor="ics-url" className="font-medium">
                  Ваша личная ссылка
                </label>
                <input
                  id="ics-url"
                  readOnly
                  value={full}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink"
                />
                <p className="type-caption text-ink-2">
                  Никому её не отправляйте: по ней виден ваш календарь.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button className="max-w-full whitespace-normal" onClick={() => copy(full)}>
                  <Copy aria-hidden />
                  Скопировать ссылку
                </Button>
                <Button asChild variant="secondary" className="max-w-full whitespace-normal">
                  <a href={webcal}>Открыть в календаре на iPhone или Mac</a>
                </Button>
              </div>
              <details className="rounded-control border border-line p-3">
                <summary className="min-h-11 cursor-pointer py-2 font-medium">
                  Как добавить в Google Calendar
                </summary>
                <ol className="list-decimal pl-5 type-body">
                  <li>Откройте calendar.google.com на компьютере.</li>
                  <li>Слева в «Другие календари» нажмите «+» и выберите «Из URL».</li>
                  <li>Вставьте ссылку и нажмите «Добавить календарь».</li>
                </ol>
              </details>
              <details className="rounded-control border border-line p-3">
                <summary className="min-h-11 cursor-pointer py-2 font-medium">
                  Как добавить в Apple Calendar
                </summary>
                <ol className="list-decimal pl-5 type-body">
                  <li>Нажмите «Открыть в календаре на iPhone или Mac» выше.</li>
                  <li>Подтвердите подписку.</li>
                  <li>
                    Или: Настройки, Календарь, Учётные записи, Новая, Другое, «Подписной календарь».
                  </li>
                </ol>
              </details>
              <p className="type-caption text-ink-2">
                Только дедлайны:{" "}
                <button
                  type="button"
                  className="min-h-11 text-accent underline"
                  onClick={() => copy(`${full}?cal=deadlines`)}
                >
                  скопировать отдельную ссылку
                </button>
                . Календари обновляются раз в час, по правилам приложения календаря.
              </p>
              <div className="flex flex-col gap-2 border-t border-line pt-3">
                <h3 className="type-h3">Ссылка попала не туда?</h3>
                {!confirming ? (
                  <Button
                    variant="danger"
                    className="max-w-full self-start whitespace-normal"
                    onClick={() => setConfirming(true)}
                  >
                    Сбросить ссылку
                  </Button>
                ) : (
                  <div
                    className="flex flex-col gap-2"
                    role="group"
                    aria-label="Подтверждение сброса"
                  >
                    <p className="type-body">
                      Старая ссылка сразу перестанет работать. Календарь придётся подключить заново
                      по новой.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="danger" loading={rotating} onClick={rotate}>
                        Да, сбросить
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirming(false)}>
                        Не сбрасывать
                      </Button>
                    </div>
                  </div>
                )}
                {error && <InlineError>{error}</InlineError>}
              </div>
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
