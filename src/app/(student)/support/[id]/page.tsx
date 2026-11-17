import type { Metadata } from "next";
import { Suspense } from "react";
import { TicketScreen } from "@/components/support/support-screens";

export const metadata: Metadata = { title: "Обращение — Компас" };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <TicketScreen id={id} />
    </Suspense>
  );
}
