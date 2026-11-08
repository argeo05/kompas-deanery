"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { ErrorState, InlineError } from "@/components/ui/error-state";
import { formatTimeMsk } from "@/lib/format";
import type { ApiState } from "@/lib/use-api";

// Единая обвязка состояний экрана (SPEC §6.2–6.4, «Состояния»): загрузка → скелетон, ошибка при
// наличии кэша → данные + плашка с временем, ошибка без кэша → экран с действием, офлайн без кэша →
// «Нет сети». Пустое состояние решает сам экран: оно зависит от формы данных.

export function ApiView<T>({
  api,
  skeleton,
  children,
  notFound,
}: {
  api: ApiState<T>;
  skeleton: React.ReactNode;
  children: (data: T) => React.ReactNode;
  /** Что показать, если API ответил 404 (чужой или несуществующий ресурс). */
  notFound?: React.ReactNode;
}) {
  const retry = (
    <Button variant="secondary" onClick={api.reload}>
      Повторить
    </Button>
  );

  if (api.data === undefined) {
    if (api.error === "not_found" && notFound) return <>{notFound}</>;
    if (api.error === "offline") {
      return (
        <ErrorState title="Нет сети" action={retry}>
          Подключитесь к интернету и нажмите «Повторить». Экран загрузится, как только сеть
          появится.
        </ErrorState>
      );
    }
    if (api.error) {
      return (
        <ErrorState title="Не получилось загрузить" action={retry}>
          Сервер не ответил. Нажмите «Повторить» или зайдите через минуту.
        </ErrorState>
      );
    }
    return <>{skeleton}</>;
  }

  const at = api.fetchedAt ? formatTimeMsk(new Date(api.fetchedAt)) : null;
  return (
    <>
      {api.error === "server" && (
        <InlineError action={retry}>
          Не удалось обновить.{at ? ` Показаны данные от ${at}.` : ""}
        </InlineError>
      )}
      {api.error === "offline" && at && (
        <p role="status" className="type-caption text-ink-2">
          Нет сети. Показаны данные от {at}.
        </p>
      )}
      {children(api.data)}
    </>
  );
}
