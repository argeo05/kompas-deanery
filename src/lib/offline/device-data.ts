"use client";

// Личные данные Компаса на устройстве (SPEC §6.13 п.5, D-014): ответы API в IndexedDB с меткой времени,
// «кто вошёл» для офлайн-оболочки, PDF в Cache Storage, черновики заявок в localStorage.
// Всё привязано к userId: вошёл другой человек — старое стирается целиком; вышли — тоже.

import { idb } from "./idb";
import { DATA_MAX_AGE_MS, DOCS_CACHE } from "./policy";

export interface CachedResponse<T> {
  userId: string;
  url: string;
  data: T;
  /** Время последнего УСПЕШНОГО обновления (мс). */
  at: number;
}

const dataKey = (userId: string, url: string) => `${userId}|${url}`;

export async function readCachedResponse<T>(
  userId: string,
  url: string,
): Promise<CachedResponse<T> | null> {
  const hit = await idb.get<CachedResponse<T>>("data", dataKey(userId, url));
  if (!hit || hit.userId !== userId || hit.url !== url) return null;
  if (Date.now() - hit.at > DATA_MAX_AGE_MS) return null;
  return hit;
}

export async function writeCachedResponse<T>(entry: CachedResponse<T>): Promise<void> {
  await idb.put("data", dataKey(entry.userId, entry.url), entry);
}

// ── Кто вошёл на этом устройстве ─────────────────────────────────────────────

export interface DeviceUser {
  userId: string;
  displayName: string;
  initials: string;
}

const USER_KEY = "user";
const SIGNED_OUT_KEY = "signed-out";

export function readDeviceUser(): Promise<DeviceUser | undefined> {
  return idb.get<DeviceUser>("meta", USER_KEY);
}

/**
 * Вызывается в кабинете после входа (данные из серверной сессии). Если на устройстве лежат данные
 * другого человека, они стираются до того, как экран что-то сохранит.
 */
export async function claimDevice(user: DeviceUser): Promise<void> {
  const prev = await readDeviceUser();
  // Экран нового человека мог успеть сохранить свои данные раньше этой проверки — их не трогаем.
  if (prev && prev.userId !== user.userId) await wipeDeviceData(user.userId);
  await idb.put("meta", USER_KEY, user);
}

/** Выход без сети: сервер о нём ещё не знает. Флаг живёт до успешного выхода на сервере. */
export async function markSignedOut(): Promise<void> {
  await idb.put("meta", SIGNED_OUT_KEY, true);
}

export async function isSignedOutPending(): Promise<boolean> {
  return (await idb.get<boolean>("meta", SIGNED_OUT_KEY)) === true;
}

export async function clearSignedOut(): Promise<void> {
  await idb.delete("meta", SIGNED_OUT_KEY);
}

// ── Полная очистка ───────────────────────────────────────────────────────────

const memoryWipers = new Set<() => void>();

/** Кэши в памяти вкладки (useApi) регистрируются здесь, чтобы стираться вместе с остальным. */
export function onDeviceWipe(fn: () => void) {
  memoryWipers.add(fn);
}

/**
 * Стирает всё личное: ответы API, очередь действий, «кто вошёл», PDF, черновики заявок.
 * Оболочку приложения (precache) не трогает: в ней нет личных данных.
 */
export async function wipeDeviceData(keepUserId?: string): Promise<void> {
  for (const fn of memoryWipers) fn();
  const clearData = keepUserId
    ? idb
        .keys("data")
        .then((keys) =>
          Promise.all(
            keys.filter((k) => !k.startsWith(`${keepUserId}|`)).map((k) => idb.delete("data", k)),
          ),
        )
    : idb.clear("data");
  await Promise.all([clearData, idb.clear("outbox"), idb.clear("meta")]);
  try {
    if ("caches" in globalThis) await caches.delete(DOCS_CACHE);
  } catch {
    // Cache Storage закрыт: в нём и нечего стирать.
  }
  for (const storage of [safeStorage("localStorage"), safeStorage("sessionStorage")]) {
    if (!storage) continue;
    try {
      for (const key of Object.keys(storage)) {
        if (key.startsWith("kompas:draft:") || key.startsWith("kompas:api:"))
          storage.removeItem(key);
      }
    } catch {
      // Хранилище недоступно.
    }
  }
}

function safeStorage(name: "localStorage" | "sessionStorage"): Storage | null {
  try {
    return window[name];
  } catch {
    return null;
  }
}
