// Фоновая отправка очереди из service worker (Background Sync). Очередь уходит только от имени того,
// кто её создал: сначала узнаём, чья сессия в cookie, и отправляем лишь его элементы.
import { flushLocked } from "./outbox-store";

export async function flushOutboxFromWorker(): Promise<void> {
  let userId: string | undefined;
  try {
    const res = await fetch("/api/me", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return;
    userId = ((await res.json()) as { userId?: string }).userId;
  } catch {
    // Сети всё ещё нет: браузер повторит sync сам, если мы бросим ошибку.
    throw new Error("offline");
  }
  if (!userId) return;
  const result = await flushLocked(userId);
  if (result.stopped === "network") throw new Error("offline");
}
