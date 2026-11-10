import type { Metadata } from "next";
import { StaffScheduleScreen } from "@/components/staff/schedule-screen";

export const metadata: Metadata = { title: "Изменения расписания — Компас" };

export default function StaffSchedulePage() {
  return <StaffScheduleScreen />;
}
