"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { ErrorState, InlineError } from "@/components/ui/error-state";
import { DataFreshness } from "@/components/ui/data-freshness";
import { useReportDataAt } from "@/lib/offline/network";
import { formatTimeMsk } from "@/lib/format";
import type { ApiState } from "@/lib/use-api";

// Единая обвязка состояний экрана (SPEC §6.2–6.4, «Состояния»): загрузка → скелетон, ошибка при
// наличии кэша → данные + плашка с временем, ошибка без кэша → экран с действием, офлайн без кэша →
// «Нет сети». Пустое состояние решает сам экран: оно зависит от формы данных.
// Без сети над данными — «Нет сети · обновлено 12 мин назад» (SPEC §6.13), время уходит и в плашку офлайна.

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
  useReportDataAt(api.data === undefined ? null : api.fetchedAt);
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
          Этот экран ещё не сохранялся на устройстве. Подключитесь к интернету и нажмите «Повторить»
          — откроем экран и сохраним его для офлайна.
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
      {api.error === "offline" && api.fetchedAt !== null && <DataFreshness at={api.fetchedAt} />}
      {children(api.data)}
    </>
  );
}
