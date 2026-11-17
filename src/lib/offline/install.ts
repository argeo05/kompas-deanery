"use client";

import * as React from "react";

// Установка на главный экран (SPEC §6.13 п.1): событие beforeinstallprompt (Chrome на Android и
// десктопе) запоминаем, чтобы предложить установку своей кнопкой, а не баннером браузера.
// iOS события не даёт — там показываем инструкцию «Поделиться → На экран Домой».

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function captureInstallPrompt(): () => void {
  const onPrompt = (e: Event) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  };
  const onInstalled = () => {
    deferred = null;
    emit();
  };
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

export function useCanPromptInstall(): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => deferred !== null,
    () => false,
  );
}

/** Показать системный диалог установки. true — человек согласился. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  emit();
  await e.prompt();
  return (await e.userChoice).outcome === "accepted";
}

export type InstallPlatform = "ios" | "android" | "other";

/** Платформа для инструкции. Уже установленное приложение — null. */
export function detectInstallPlatform(): InstallPlatform | null {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return null;
  const ua = navigator.userAgent;
  // iPadOS 13+ представляется Mac с сенсорным экраном.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1))
    return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

// Подсказка не навязчивая: со второго визита и один раз (SPEC §6.13 п.1).
const VISITS_KEY = "kompas:install:visits";
const DISMISSED_KEY = "kompas:install:dismissed";
const VISIT_GAP_MS = 30 * 60_000;

/** Учесть визит (не чаще раза в 30 минут) и сказать, пора ли показать подсказку. */
export function registerVisitAndCheck(): boolean {
  try {
    if (localStorage.getItem(DISMISSED_KEY)) return false;
    const raw = localStorage.getItem(VISITS_KEY);
    const prev = raw ? (JSON.parse(raw) as { count: number; last: number }) : { count: 0, last: 0 };
    const now = Date.now();
    const next = now - prev.last > VISIT_GAP_MS ? { count: prev.count + 1, last: now } : prev;
    localStorage.setItem(VISITS_KEY, JSON.stringify(next));
    return next.count >= 2;
  } catch {
    return false;
  }
}

export function dismissInstallHint() {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Не запомнили — подсказка вернётся в следующий раз, это не страшно.
  }
}
