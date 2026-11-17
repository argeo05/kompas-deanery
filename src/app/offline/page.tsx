import type { Metadata } from "next";
import { OfflineShell } from "@/components/offline/offline-shell";

// /offline — запасная страница service worker (SPEC §5.4, §6.13). Публичная и без личных данных:
// SW кладёт её в precache и показывает вместо страницы, которая не загрузилась из-за сети.
export const metadata: Metadata = {
  title: "Нет сети — Компас",
  robots: { index: false },
};

export default function OfflinePage() {
  return <OfflineShell />;
}
