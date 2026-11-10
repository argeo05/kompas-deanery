import type { Metadata } from "next";
import { Suspense } from "react";
import { NotificationSettingsScreen } from "@/components/notifications/settings-screen";

export const metadata: Metadata = { title: "Настройки уведомлений — Компас" };

export default function NotificationSettingsPage() {
  return (
    <Suspense>
      <NotificationSettingsScreen />
    </Suspense>
  );
}
