"use client";

// Настройка «Хранить данные на устройстве» (SPEC §6.11 п.3). По умолчанию включена.
// Хранится в localStorage под ключом без префиксов kompas:draft:/kompas:api:, поэтому выход
// из аккаунта её не стирает: это настройка устройства, а не личные данные.

const KEY = "kompas:pref:offline";

export function isOfflineStoreEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setOfflineStoreEnabled(on: boolean): void {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, "off");
  } catch {
    // Хранилище закрыто: настройка не запомнится, данные всё равно можно очистить кнопкой.
  }
}
