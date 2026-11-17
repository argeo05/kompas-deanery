"use client";

import { clearSignedOut, lockDevice, markSignedOut, wipeDeviceData } from "./device-data";

// Выход (SPEC §6.1, §6.13 п.5, AC-1.3, AC-13.4). Сначала стираем всё личное на устройстве — это
// работает и без сети. Потом просим сервер закрыть сессию. Без сети сервер об этом не узнает, поэтому
// ставим флаг «вышли»: офлайн-оболочка показывает экран входа, а при появлении сети выход завершается.

async function serverSignOut(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/sign-out", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Выйти. "server" — сессия закрыта; "device" — данные стёрты, сервер узнает, когда появится сеть. */
export async function signOut(): Promise<"server" | "device"> {
  // С этого момента вкладка ничего не сохраняет: запросы «в полёте» не вернут данные обратно.
  lockDevice();
  await wipeDeviceData();
  const closed = await serverSignOut();
  // Пока шёл запрос, кабинет мог успеть что-то записать (например, «кто вошёл»): стираем ещё раз.
  await wipeDeviceData();
  if (closed) return "server";
  await markSignedOut();
  return "device";
}

/** Завершить выход, начатый без сети. true — сессия на сервере закрыта. */
export async function finishPendingSignOut(): Promise<boolean> {
  if (!(await serverSignOut())) return false;
  // Пока шёл выход, кабинет мог успеть что-то сохранить: стираем ещё раз.
  await wipeDeviceData();
  await clearSignedOut();
  return true;
}

/** Все сеансы закрыты на сервере («Выйти на всех устройствах»): остаётся стереть данные здесь. */
export async function wipeAfterRevokeAll(): Promise<void> {
  lockDevice();
  await wipeDeviceData();
}
