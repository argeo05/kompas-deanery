"use client";

import * as React from "react";
import { useToast } from "@/components/ui/toast";
import { claimDevice, isSignedOutPending, type DeviceUser } from "@/lib/offline/device-data";
import { onReconnect } from "@/lib/offline/network";
import { finishPendingSignOut } from "@/lib/offline/sign-out";
import { flushOutbox } from "@/lib/offline/use-outbox";
import { warmOfflineData } from "@/lib/offline/warm";
import { plural } from "@/lib/format";

// Офлайн-обвязка кабинета студента (SPEC §6.13, D-014). Живёт в layout (student):
// • привязывает данные устройства к вошедшему (другой человек → старое стирается);
// • завершает выход, начатый без сети (до этого кабинет закрыт заглушкой);
// • отправляет очередь офлайн-действий при открытии и при возвращении сети;
// • в фоне сохраняет офлайн-набор данных и PDF.

export function useFlushWithToasts(userId: string) {
  const toast = useToast();
  return React.useCallback(async () => {
    const result = await flushOutbox(userId);
    if (result.sent.length > 0) {
      const n = result.sent.length;
      toast({
        tone: "success",
        title:
          n === 1
            ? "Отправили то, что ждало сети"
            : `Отправили ${n} ${plural(n, ["действие", "действия", "действий"])}, которые ждали сети`,
        description: result.sent.map((i) => i.label).join(", "),
      });
    }
    if (result.failed.length > 0) {
      toast({
        tone: "error",
        title: "Не всё удалось отправить",
        description: result.failed[0]!.error,
      });
    }
    return result;
  }, [toast, userId]);
}

export function OfflineSession({ user }: { user: DeviceUser }) {
  const [closing, setClosing] = React.useState(false);
  const flush = useFlushWithToasts(user.userId);
  const { userId, displayName, initials } = user;

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      if (await isSignedOutPending()) {
        // Человек вышел без сети, а cookie сессии ещё жива: сначала закрываем её.
        if (!alive) return;
        setClosing(true);
        if (await finishPendingSignOut()) window.location.replace("/login");
        return;
      }
      await claimDevice({ userId, displayName, initials });
      if (!alive) return;
      await flush();
      if (alive && navigator.onLine) await warmOfflineData(userId);
    })();

    const onBack = () => {
      void flush().then((r) => {
        if (r.stopped !== "network") void warmOfflineData(userId);
      });
    };
    const onVisible = () => document.visibilityState === "visible" && void flush();
    const off = onReconnect(onBack);
    // Service worker отправил очередь в фоне или попросил отправить.
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      off();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, displayName, initials, flush]);

  if (!closing) return null;
  return (
    <div
      role="status"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg p-6 text-center"
    >
      <p className="type-h3">Завершаем выход…</p>
    </div>
  );
}
