"use client";

import * as React from "react";
import { useToast } from "@/components/ui/toast";
import { captureInstallPrompt } from "@/lib/offline/install";

// Регистрация service worker и тост «Доступна новая версия · Обновить» (SPEC §6.13 п.1, п.6).
// Новая версия не включается сама посреди действия: только по нажатию.
// В dev SW не регистрируется (горячая перезагрузка и кэш оболочки мешают друг другу).

export const SW_URL = "/sw.js";

export function ServiceWorkerManager() {
  const toast = useToast();

  React.useEffect(() => captureInstallPrompt(), []);

  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    let cancelled = false;
    let accepted = false;
    const offered = new WeakSet<ServiceWorker>();

    const offer = (worker: ServiceWorker | null) => {
      // Первая установка (страницей ещё никто не управляет) — не обновление.
      if (!worker || offered.has(worker) || !sw.controller) return;
      offered.add(worker);
      toast({
        tone: "info",
        title: "Доступна новая версия Компаса",
        description: "Обновите, когда закончите текущее действие.",
        action: {
          label: "Обновить",
          onClick: () => {
            accepted = true;
            worker.postMessage({ type: "SKIP_WAITING" });
          },
        },
      });
    };

    // Новая версия взяла управление после «Обновить» — перезагружаем один раз.
    const onControllerChange = () => {
      if (!accepted) return;
      accepted = false;
      window.location.reload();
    };

    sw.addEventListener("controllerchange", onControllerChange);
    sw.register(SW_URL, { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        if (cancelled) return;
        offer(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed") offer(installing);
          });
        });
      })
      .catch(() => {
        // Браузер отказал (приватный режим, политика): кабинет работает и без офлайна.
      });

    return () => {
      cancelled = true;
      sw.removeEventListener("controllerchange", onControllerChange);
    };
  }, [toast]);

  return null;
}
