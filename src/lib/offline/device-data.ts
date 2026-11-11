"use client";

// Личные данные Компаса на устройстве (SPEC §6.13 п.5, D-014): ответы API в IndexedDB с меткой времени,
// «кто вошёл» для офлайн-оболочки, PDF в Cache Storage, черновики заявок в localStorage.
// Всё привязано к userId: вошёл другой человек — старое стирается целиком; вышли — тоже.

import { idb } from "./idb";
import { DATA_MAX_AGE_MS, DOCS_CACHE } from "./policy";
import { isOfflineStoreEnabled } from "./prefs";

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
  // Выход начат или человек выключил хранение на устройстве — ничего не записываем.
  if (locked || !isOfflineStoreEnabled()) return;
  await idb.put("data", dataKey(entry.userId, entry.url), entry);
}

// ── Замок на время выхода ────────────────────────────────────────────────────
// Запросы, начатые до «Выйти», могут вернуться после очистки и снова записать данные. После начала
// выхода вкладка больше ничего не сохраняет (она уходит на /login).

let locked = false;

export function lockDevice() {
  locked = true;
}

export function isDeviceLocked(): boolean {
  return locked;
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
  if (locked) return;
  const prev = await readDeviceUser();
  // «Кто вошёл» не записан (или записан другой), а данные могут лежать чужие — стираем всё, кроме
  // данных и очереди нового человека: его экран мог успеть сохранить своё раньше этой проверки.
  if (prev?.userId !== user.userId) await wipeDeviceData(user.userId);
  if (locked) return;
  await idb.put("meta", USER_KEY, user);
}

/**
 * Вошёл не студент (сотрудник): личные данные прошлого студента на устройстве не нужны никому.
 */
export async function releaseDevice(): Promise<void> {
  const [prev, keys] = await Promise.all([readDeviceUser(), idb.keys("data")]);
  if (prev || keys.length > 0) await wipeDeviceData();
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
  // Очередь: у нового человека остаются только его действия, остальное стирается.
  const clearOutbox = keepUserId
    ? idb
        .getAll<{ id: string; userId: string }>("outbox")
        .then((items) =>
          Promise.all(
            items.filter((i) => i.userId !== keepUserId).map((i) => idb.delete("outbox", i.id)),
          ),
        )
    : idb.clear("outbox");
  await Promise.all([clearData, clearOutbox, idb.clear("meta")]);
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

/**
 * «Очистить сохранённые данные» в профиле: ответы API, PDF и отметка о подготовке к офлайну.
 * Очередь неотправленных действий и «кто вошёл» остаются: человек не вышел и ничего не терял.
 */
export async function clearSavedData(): Promise<void> {
  for (const fn of memoryWipers) fn();
  await Promise.all([idb.clear("data"), idb.delete("meta", "warmed-at")]);
  try {
    if ("caches" in globalThis) await caches.delete(DOCS_CACHE);
  } catch {
    // Cache Storage закрыт: в нём и нечего стирать.
  }
}

/** Сколько места занимают данные Компаса на устройстве, байт; null — браузер не говорит. */
export async function savedDataBytes(): Promise<number | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    return estimate?.usage ?? null;
  } catch {
    return null;
  }
}
