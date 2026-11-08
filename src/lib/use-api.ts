"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

// Загрузка данных экрана из API (SPEC §6.2 «Состояния»): повторный вход показывает кэш мгновенно и
// обновляет в фоне; при ошибке остаются последние данные и время, когда они получены.
// Это лёгкий кэш в sessionStorage (живёт до закрытия вкладки, TTL сутки) на время до C7 (service worker, SPEC §6.13): ключ включает id
// пользователя, чтобы на общем устройстве данные одного студента не попали другому.

export type ApiError = "offline" | "server" | "not_found" | "unauthorized";

export interface ApiState<T> {
  data: T | undefined;
  /** Когда получены показанные данные (мс, время устройства). */
  fetchedAt: number | null;
  /** Данных ещё нет, идёт первая загрузка. */
  loading: boolean;
  /** Идёт фоновое обновление поверх уже показанных данных. */
  refreshing: boolean;
  error: ApiError | null;
  /** Данные пришли только из кэша (последнее обновление не удалось). */
  stale: boolean;
  reload: () => void;
  /** Обновление только что завершилось успешно (для плашки «Обновлено только что»). */
  justUpdated: boolean;
}

interface Options {
  /** Идентификатор пользователя — часть ключа кэша. */
  scope: string;
  /** Период опроса, мс (пока вкладка видна). */
  refreshMs?: number;
}

interface Entry<T> {
  url: string;
  data: T;
  at: number;
}

const memory = new Map<string, Entry<unknown>>();
const TTL_MS = 24 * 3600_000;

/** Стирает локальный кэш данных: при выходе и при потере сессии. */
export function wipeApiCache() {
  memory.clear();
  try {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith("kompas:api:v1:")) window.sessionStorage.removeItem(key);
    }
  } catch {
    // Хранилище недоступно: нечего чистить.
  }
}
const storageKey = (scope: string, url: string) => `kompas:api:v1:${scope}:${url}`;

function readCache<T>(scope: string, url: string): Entry<T> | null {
  const key = storageKey(scope, url);
  const hit = memory.get(key);
  if (hit) return Date.now() - hit.at < TTL_MS ? (hit as Entry<T>) : null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T>;
    if (parsed.url !== url || typeof parsed.at !== "number" || Date.now() - parsed.at > TTL_MS)
      return null;
    memory.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeCache<T>(scope: string, entry: Entry<T>) {
  const key = storageKey(scope, entry.url);
  memory.set(key, entry);
  try {
    window.sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Хранилище закрыто или переполнено: кэш в памяти остаётся.
  }
}

export function useApi<T>(url: string | null, { scope, refreshMs }: Options): ApiState<T> {
  const [entry, setEntry] = React.useState<Entry<T> | null>(null);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [fetching, setFetching] = React.useState(url !== null);
  const [fromCache, setFromCache] = React.useState(false);
  const [justUpdated, setJustUpdated] = React.useState(false);
  const seq = React.useRef(0);
  const router = useRouter();

  const load = React.useCallback(
    async (initial = false) => {
      if (url === null) return;
      const mine = ++seq.current;
      if (initial) {
        // Смена адреса: сначала кэш этого адреса (если есть), потом обновление.
        const cached = readCache<T>(scope, url);
        setEntry(cached);
        setFromCache(cached !== null);
        setError(null);
      }
      setFetching(true);
      try {
        const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
        if (mine !== seq.current) return;
        if (res.status === 401) {
          wipeApiCache();
          setError("unauthorized");
          router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        if (res.status === 404) {
          setError("not_found");
          return;
        }
        if (!res.ok) {
          setError("server");
          return;
        }
        const data = (await res.json()) as T;
        if (mine !== seq.current) return;
        const next = { url, data, at: Date.now() };
        writeCache(scope, next);
        setEntry(next);
        setError(null);
        setFromCache(false);
        setJustUpdated(true);
      } catch {
        if (mine !== seq.current) return;
        setError(navigator.onLine ? "server" : "offline");
      } finally {
        if (mine === seq.current) setFetching(false);
      }
    },
    [url, scope, router],
  );

  React.useEffect(() => {
    const counter = seq;
    // Состояние внутри load меняется после await, не синхронно: правило здесь ошибается.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(true);
    return () => {
      counter.current++;
    };
  }, [load]);

  // Плашка «Обновлено только что» гаснет через 2 с.
  React.useEffect(() => {
    if (!justUpdated) return;
    const id = window.setTimeout(() => setJustUpdated(false), 2000);
    return () => window.clearTimeout(id);
  }, [justUpdated, entry]);

  // Опрос, возврат на вкладку и возвращение сети.
  React.useEffect(() => {
    if (url === null) return;
    const visible = () => document.visibilityState === "visible";
    const refresh = () => {
      if (visible()) void load();
    };
    const id = refreshMs ? window.setInterval(refresh, refreshMs) : undefined;
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      if (id) window.clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [url, refreshMs, load]);

  const current = entry && entry.url === url ? entry : null;
  return {
    data: current?.data,
    fetchedAt: current?.at ?? null,
    loading: current === null && error === null && (fetching || url !== null),
    refreshing: fetching && current !== null,
    error,
    stale: current !== null && (error !== null || fromCache),
    reload: () => void load(),
    justUpdated,
  };
}
