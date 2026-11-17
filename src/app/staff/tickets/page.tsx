import type { Metadata } from "next";
import { TicketsScreen } from "@/components/staff/tickets-screens";

export const metadata: Metadata = { title: "Обращения — Компас" };

export default function StaffTicketsPage() {
  return <TicketsScreen />;
}
