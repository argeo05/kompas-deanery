import type { Metadata } from "next";
import { Suspense } from "react";
import { ScheduleScreen } from "@/components/schedule/schedule-screen";

export const metadata: Metadata = { title: "Расписание — Компас" };

export default function SchedulePage() {
  return (
    <Suspense>
      <ScheduleScreen />
    </Suspense>
  );
}
