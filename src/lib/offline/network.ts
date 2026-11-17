"use client";

import * as React from "react";

// Индикатор сети (SPEC §6.13 п.3): navigator.onLine + доступность API. «Белые списки» мобильных
// операторов дают onLine = true, но запросы не проходят — тогда первый неудачный запрос включает
// «пульс» (/api/health), и плашка горит, пока сервер снова не ответит.

const PULSE_MS = 15_000;
const RECONNECT_EVENT = "kompas:reconnect";

let reachable = true;
let pulseTimer: number | undefined;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

async function pulse() {
  window.clearTimeout(pulseTimer);
  pulseTimer = undefined;
  if (reachable) return;
  try {
    const res = await fetch("/api/health", {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return reportNetworkOk();
  } catch {
    // Сервер всё ещё недоступен.
  }
  pulseTimer = window.setTimeout(pulse, PULSE_MS);
}

/** Запрос к API не дошёл до сервера. */
export function reportNetworkError() {
  if (!reachable) return;
  reachable = false;
  emit();
  pulseTimer = window.setTimeout(pulse, PULSE_MS);
}

/** Сервер ответил: связь есть. */
export function reportNetworkOk() {
  if (reachable) return;
  reachable = true;
  window.clearTimeout(pulseTimer);
  pulseTimer = undefined;
  emit();
  window.dispatchEvent(new Event(RECONNECT_EVENT));
}

/** Подписка на возвращение связи: событие браузера online и успешный «пульс». */
export function onReconnect(cb: () => void): () => void {
  const online = () => {
    // onLine вернулся — проверяем сервер сразу, не дожидаясь таймера.
    if (!reachable) void pulse();
    cb();
  };
  window.addEventListener("online", online);
  window.addEventListener(RECONNECT_EVENT, cb);
  return () => {
    window.removeEventListener("online", online);
    window.removeEventListener(RECONNECT_EVENT, cb);
  };
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine && reachable;
}

/** Есть ли связь с Компасом сейчас. На сервере и при гидратации — да. */
export function useOnline(): boolean {
  return React.useSyncExternalStore(subscribe, isOnline, () => true);
}

// ── Время показанных данных для плашки «Нет сети · данные от 08:14» ──────────
// Каждый экран (ApiView) сообщает время своих данных; плашка показывает самое раннее.

const shown = new Map<symbol, number>();
const shownListeners = new Set<() => void>();
let oldest: number | null = null;

function recompute() {
  const values = [...shown.values()];
  const next = values.length > 0 ? Math.min(...values) : null;
  if (next === oldest) return;
  oldest = next;
  for (const l of shownListeners) l();
}

export function useReportDataAt(at: number | null) {
  const id = React.useRef<symbol>(null);
  React.useEffect(() => {
    id.current ??= Symbol("data");
    const key = id.current;
    if (at === null) shown.delete(key);
    else shown.set(key, at);
    recompute();
    return () => {
      shown.delete(key);
      recompute();
    };
  }, [at]);
}

export function useShownDataAt(): number | null {
  return React.useSyncExternalStore(
    (cb) => {
      shownListeners.add(cb);
      return () => shownListeners.delete(cb);
    },
    () => oldest,
    () => null,
  );
}
