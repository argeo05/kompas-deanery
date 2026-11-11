"use client";

import * as React from "react";
import { Share, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  detectInstallPlatform,
  dismissInstallHint,
  promptInstall,
  registerVisitAndCheck,
  useCanPromptInstall,
  type InstallPlatform,
} from "@/lib/offline/install";

// Установка Компаса на главный экран (SPEC §6.13 п.1, AC-13.2).

/** Пошаговая инструкция для iOS и Android (страница «Для жюри» и подсказка). */
export function InstallSteps({ only }: { only?: Exclude<InstallPlatform, "other"> }) {
  return (
    <div className="flex flex-col gap-4">
      {only !== "android" && (
        <section aria-labelledby="install-ios" className="flex flex-col gap-2">
          <h3 id="install-ios" className="type-h3">
            iPhone и iPad (Safari)
          </h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Откройте Компас в Safari и войдите.</li>
            <li>
              Нажмите «Поделиться» <Share aria-hidden className="inline size-4 align-text-bottom" />{" "}
              внизу экрана.
            </li>
            <li>Выберите «На экран Домой» и нажмите «Добавить».</li>
          </ol>
        </section>
      )}
      {only !== "ios" && (
        <section aria-labelledby="install-android" className="flex flex-col gap-2">
          <h3 id="install-android" className="type-h3">
            Android (Chrome)
          </h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Откройте Компас в Chrome и войдите.</li>
            <li>
              Нажмите «Установить» в подсказке Компаса или в меню ⋮ → «Установить приложение».
            </li>
            <li>Подтвердите установку — значок появится на главном экране.</li>
          </ol>
        </section>
      )}
      <p className="type-caption text-ink-2">
        Проверить без интернета: откройте «Сегодня» и расписание с интернетом, включите режим полёта
        и откройте Компас с главного экрана.
      </p>
    </div>
  );
}

/** Ненавязчивая подсказка: со второго визита и один раз (закрыли — больше не показываем). */
export function InstallPrompt() {
  const canPrompt = useCanPromptInstall();
  const [state, setState] = React.useState<{ show: boolean; platform: InstallPlatform | null }>({
    show: false,
    platform: null,
  });

  React.useEffect(() => {
    const platform = detectInstallPlatform();
    const due = platform !== null && registerVisitAndCheck();
    // Решение принимается в браузере: localStorage и userAgent недоступны при рендере на сервере.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ show: due, platform });
  }, []);

  const { show, platform } = state;
  if (!show || platform === null) return null;
  if (platform !== "ios" && !canPrompt) return null;

  // Карточка исчезает вместе с фокусом — возвращаем его к началу экрана (2.4.3).
  const close = () => {
    dismissInstallHint();
    setState((s) => ({ ...s, show: false }));
    document.getElementById("content")?.focus();
  };

  return (
    <Card className="gap-3" data-testid="install-prompt">
      <div className="flex items-start gap-3">
        <Smartphone aria-hidden className="mt-0.5 size-6 shrink-0 text-accent" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="type-h3">Компас на главном экране</h2>
          <p className="text-ink-2">
            Откроется в одно касание и покажет расписание и справки даже без интернета.
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Закрыть подсказку" onClick={close}>
          <X aria-hidden />
        </Button>
      </div>
      {platform === "ios" ? (
        <InstallSteps only="ios" />
      ) : (
        <Button className="self-start" onClick={() => void promptInstall().then(close)}>
          Установить
        </Button>
      )}
    </Card>
  );
}
