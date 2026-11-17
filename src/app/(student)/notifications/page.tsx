import type { Metadata } from "next";
import { Suspense } from "react";
import { NotificationsScreen } from "@/components/notifications/notifications-screen";
import type { NotificationsTab } from "@/contracts/api";

export const metadata: Metadata = { title: "Уведомления — Компас" };

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab: NotificationsTab = tab === "important" || tab === "announcements" ? tab : "all";
  return (
    <Suspense>
      <NotificationsScreen initialTab={initialTab} />
    </Suspense>
  );
}
