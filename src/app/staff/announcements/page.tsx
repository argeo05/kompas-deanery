import type { Metadata } from "next";
import { AnnouncementsScreen } from "@/components/staff/announcements-screen";

export const metadata: Metadata = { title: "Объявления — Компас" };

export default function StaffAnnouncementsPage() {
  return <AnnouncementsScreen />;
}
