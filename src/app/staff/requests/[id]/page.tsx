import type { Metadata } from "next";
import { RequestCardScreen } from "@/components/staff/request-card-screen";

export const metadata: Metadata = { title: "Заявка — Компас" };

export default async function StaffRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RequestCardScreen id={id} />;
}
