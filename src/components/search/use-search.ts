"use client";

import * as React from "react";
import type { SearchDTO, SearchGroupKey } from "@/contracts/api";

// Поиск по кабинету (SPEC §6.10): запрос уходит через 250 мс после последнего нажатия,
// устаревший ответ отбрасывается. Ничего не кэшируем: выдача личная.

export const GROUP_LABEL: Record<SearchGroupKey, string> = {
  actions: "Действия",
  requests: "Мои заявки",
  deadlines: "Дедлайны",
  schedule: "Расписание и дисциплины",
  teachers: "Преподаватели",
  rooms: "Аудитории",
  kb: "Справочник",
  announcements: "Объявления",
};

export type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; offline: boolean }
  | { status: "done"; data: SearchDTO };

export function useSearch(q: string): SearchState {
  const query = q.trim();
  const [state, setState] = React.useState<SearchState>({ status: "idle" });

  React.useEffect(() => {
    if (query.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: "idle" });
      return;
    }
    const ctrl = new AbortController();
    setState({ status: "loading" });
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/me/search?q=${encodeURIComponent(query)}`, {
          credentials: "same-origin",
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        setState({ status: "done", data: (await res.json()) as SearchDTO });
      } catch {
        if (!ctrl.signal.aborted) setState({ status: "error", offline: !navigator.onLine });
      }
    }, 250);
    return () => {
      window.clearTimeout(id);
      ctrl.abort();
    };
  }, [query]);

  return state;
}
