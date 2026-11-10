import type { Metadata } from "next";
import { TicketScreen } from "@/components/staff/tickets-screens";

export const metadata: Metadata = { title: "Обращение — Компас" };

export default async function StaffTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TicketScreen id={id} />;
}
