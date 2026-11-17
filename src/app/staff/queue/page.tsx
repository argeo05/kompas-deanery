import type { Metadata } from "next";
import { QueueScreen } from "@/components/staff/queue-screen";

export const metadata: Metadata = { title: "Очередь заявок — Компас" };

export default function StaffQueuePage() {
  return <QueueScreen />;
}
