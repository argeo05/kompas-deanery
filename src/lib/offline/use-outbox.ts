"use client";

import * as React from "react";
import { byCreation, enqueue, type OutboxItem, type OutboxKind } from "./outbox";
import { OUTBOX_CHANNEL, flushLocked, notifyOutboxChanged, outboxStorage } from "./outbox-store";
import type { FlushResult } from "./outbox";

// Очередь офлайн-действий для экранов: поставить действие, показать «Ожидает отправки»,
// отправить при возвращении сети (SPEC §6.13 п.4, §6.5 «Офлайн»).

let snapshot: OutboxItem[] = [];
const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;

async function refresh() {
  snapshot = (await outboxStorage.all()).sort(byCreation);
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (listeners.size === 1) {
    void refresh();
    try {
      channel = new BroadcastChannel(OUTBOX_CHANNEL);
      channel.onmessage = () => void refresh();
    } catch {
      channel = null;
    }
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) {
      channel?.close();
      channel = null;
      navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
    }
  };
}

function onWorkerMessage(event: MessageEvent) {
  if (event.data === "outbox-changed") void refresh();
}

const EMPTY: OutboxItem[] = [];

/** Действия пользователя в очереди (ожидают отправки или не отправились). */
export function useOutbox(userId: string, filter?: (i: OutboxItem) => boolean): OutboxItem[] {
  const all = React.useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
  return React.useMemo(
    () => all.filter((i) => i.userId === userId && (!filter || filter(i))),
    // filter — обычно стрелка в рендере; зависим от данных, а не от её идентичности.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, userId],
  );
}

export interface QueueInput {
  /** Idempotency-Key: тот же, что ушёл бы с онлайн-попыткой. */
  id: string;
  userId: string;
  kind: OutboxKind;
  url: string;
  body?: unknown;
  label: string;
  target?: string;
}

/** Поставить действие в очередь. Возвращает элемент или null, если оно погасило противоположное. */
export async function queueAction(input: QueueInput): Promise<OutboxItem | null> {
  const item = await enqueue(outboxStorage, {
    ...input,
    method: "POST",
    createdAt: Date.now(),
    attempts: 0,
    state: "pending",
  });
  await refresh();
  notifyOutboxChanged();
  // Background Sync (Chrome): отправит, даже если вкладку закроют. Где его нет — при следующем открытии.
  try {
    // getRegistration, а не ready: ready не завершится, если SW не зарегистрирован (dev, отказ браузера).
    const reg = (await navigator.serviceWorker?.getRegistration()) as
      (ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }) | undefined;
    await reg?.sync?.register("kompas-outbox");
  } catch {
    // Нет Background Sync — отправим при возвращении сети или следующем открытии.
  }
  return item;
}

export async function removeQueued(id: string): Promise<void> {
  await outboxStorage.remove(id);
  await refresh();
  notifyOutboxChanged();
}

/** Отправить очередь текущего пользователя (по возвращении сети, при открытии кабинета). */
export async function flushOutbox(userId: string): Promise<FlushResult> {
  const result = await flushLocked(userId);
  await refresh();
  return result;
}

/** Сколько действий на устройстве ждёт отправки (очередь принадлежит одному человеку: D-014). */
export function usePendingCount(): number {
  const all = React.useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
  return all.filter((i) => i.state === "pending").length;
}
