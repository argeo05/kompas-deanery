"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  onDeviceWipe,
  readCachedResponse,
  wipeDeviceData,
  writeCachedResponse,
} from "@/lib/offline/device-data";
import { onReconnect, reportNetworkError, reportNetworkOk } from "@/lib/offline/network";
import { isPersistable } from "@/lib/offline/policy";

// Загрузка данных экрана из API (SPEC §6.2 «Состояния», §6.13): stale-while-revalidate.
// Сначала показываем сохранённое (память вкладки, затем IndexedDB устройства), параллельно идём в сеть;
// ответ сервера заменяет данные и время «обновлено». Ошибка или пустой ответ хорошие данные не затирают.
// На устройстве хранятся только данные студента (policy.ts), ключ включает id пользователя.

export type ApiError = "offline" | "server" | "not_found" | "unauthorized";

export interface ApiState<T> {
  data: T | undefined;
  /** Когда получены показанные данные (мс, время устройства) — время последнего успешного обновления. */
  fetchedAt: number | null;
  /** Данных ещё нет, идёт первая загрузка. */
  loading: boolean;
  /** Идёт фоновое обновление поверх уже показанных данных. */
  refreshing: boolean;
  error: ApiError | null;
  /** Показаны сохранённые данные (последнее обновление не удалось или ещё идёт). */
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

/** Сколько ждать ответа: при «белых списках» запрос может висеть минутами — лучше показать кэш. */
const FETCH_TIMEOUT_MS = 12_000;

const memory = new Map<string, Entry<unknown>>();
onDeviceWipe(() => memory.clear());

/** Стирает локальные данные: при выходе и при потере сессии. */
export function wipeApiCache(): Promise<void> {
  return wipeDeviceData();
}

const memoryKey = (scope: string, url: string) => `${scope}|${url}`;

async function readCache<T>(scope: string, url: string): Promise<Entry<T> | null> {
  const hit = memory.get(memoryKey(scope, url));
  if (hit) return hit as Entry<T>;
  if (!isPersistable(url)) return null;
  const stored = await readCachedResponse<T>(scope, url);
  if (!stored) return null;
  const entry = { url, data: stored.data, at: stored.at };
  memory.set(memoryKey(scope, url), entry);
  return entry;
}

/** Сохранить ответ API (экран или фоновая подготовка офлайна). */
export async function storeApiData<T>(scope: string, url: string, data: T, at = Date.now()) {
  memory.set(memoryKey(scope, url), { url, data, at });
  if (isPersistable(url)) await writeCachedResponse({ userId: scope, url, data, at });
}

export function fetchJson(url: string): Promise<Response> {
  return fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
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
        // Смена адреса: сначала сохранённое для этого адреса (если есть), потом обновление.
        setError(null);
        const cached = await readCache<T>(scope, url);
        if (mine !== seq.current) return;
        setEntry(cached);
        setFromCache(cached !== null);
      }
      setFetching(true);
      try {
        const res = await fetchJson(url);
        if (mine !== seq.current) return;
        reportNetworkOk();
        if (res.status === 401) {
          await wipeApiCache();
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
        if (data === null || data === undefined) {
          // Пустой ответ не затирает хорошие данные (SPEC §6.13 «Тонкости»).
          setError("server");
          return;
        }
        const next = { url, data, at: Date.now() };
        await storeApiData(scope, url, data, next.at);
        if (mine !== seq.current) return;
        setEntry(next);
        setError(null);
        setFromCache(false);
        setJustUpdated(true);
      } catch {
        if (mine !== seq.current) return;
        // Запрос не дошёл до сервера (нет сети, «белый список», таймаут).
        reportNetworkError();
        setError("offline");
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
    const offReconnect = onReconnect(refresh);
    return () => {
      if (id) window.clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      offReconnect();
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
