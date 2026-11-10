import type { Metadata } from "next";
import { AnnouncementFormScreen } from "@/components/staff/announcement-form-screen";

export const metadata: Metadata = { title: "Новое объявление — Компас" };

export default function StaffAnnouncementNewPage() {
  return <AnnouncementFormScreen />;
}
