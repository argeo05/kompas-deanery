"use client";

import * as React from "react";
import { toMskDate } from "./time";

// Текущее время для обратного отсчёта (SPEC §6.2 п.1): обновляется раз в минуту, а не каждую секунду
// (экономия батареи, меньше «дёрганья» для экранных дикторов). serverNow — время сервера из ответа API:
// отсчёт идёт по часам сервера, даже если часы на устройстве уходят.

export function useNow(serverNow?: string, tickMs = 60_000): Date {
  const [nowMs, setNowMs] = React.useState<number | null>(null);
  const skew = React.useRef(0);

  React.useEffect(() => {
    skew.current = serverNow ? Date.parse(serverNow) - Date.now() : 0;
    setNowMs(Date.now() + skew.current);
  }, [serverNow]);

  React.useEffect(() => {
    const update = () => setNowMs(Date.now() + skew.current);
    const id = window.setInterval(update, tickMs);
    const onVisible = () => document.visibilityState === "visible" && update();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tickMs]);

  // До первого эффекта (и при гидратации) берём время сервера из ответа: без прыжка.
  return new Date(nowMs ?? (serverNow ? Date.parse(serverNow) : 0));
}

const noSubscribe = () => () => {};

/** Сегодняшняя дата по Москве («2026-11-12»). На сервере null: дата зависит от часов устройства. */
export function useTodayIso(): string | null {
  return React.useSyncExternalStore(
    noSubscribe,
    () => toMskDate(new Date()),
    () => null,
  );
}
