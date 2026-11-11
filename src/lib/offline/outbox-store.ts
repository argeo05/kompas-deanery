// Очередь офлайн-действий в IndexedDB и отправка элемента. Общая часть для страницы и service worker.
import { idb } from "./idb";
import {
  flush,
  memoryStorage,
  type FlushResult,
  type OutboxItem,
  type OutboxStorage,
} from "./outbox";

const fallback = memoryStorage();

/** Хранилище очереди: IndexedDB, а если оно недоступно — память вкладки. */
export const outboxStorage: OutboxStorage = {
  async all() {
    const items = await idb.getAll<OutboxItem>("outbox");
    return items.length > 0 ? items : fallback.all();
  },
  async put(item) {
    await idb.put("outbox", item.id, item);
    if ((await idb.get("outbox", item.id)) === undefined) await fallback.put(item);
  },
  async remove(id) {
    await idb.delete("outbox", id);
    await fallback.remove(id);
  },
};

/** Канал «очередь изменилась» между вкладками и service worker. */
export const OUTBOX_CHANNEL = "kompas-outbox";

export function sendItem(item: OutboxItem): Promise<Response> {
  return fetch(item.url, {
    method: item.method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(item.body === undefined ? {} : { "content-type": "application/json" }),
      "idempotency-key": item.id,
    },
    body: item.body === undefined ? undefined : JSON.stringify(item.body),
  });
}

/**
 * Отправка под общим замком: вкладки и service worker не отправляют очередь одновременно.
 * Без Web Locks (старый Safari) защита — Idempotency-Key на сервере.
 */
export async function flushLocked(userId: string): Promise<FlushResult> {
  const run = () => flush(outboxStorage, userId, sendItem);
  const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
  const result = locks ? await locks.request("kompas-outbox", run) : await run();
  if (result.sent.length > 0 || result.failed.length > 0) notifyOutboxChanged();
  return result;
}

export function notifyOutboxChanged() {
  try {
    const channel = new BroadcastChannel(OUTBOX_CHANNEL);
    channel.postMessage("changed");
    channel.close();
  } catch {
    // BroadcastChannel нет: другие вкладки узнают при следующем фокусе.
  }
}
