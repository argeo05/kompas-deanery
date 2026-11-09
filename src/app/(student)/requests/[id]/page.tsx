import type { Metadata } from "next";
import { Suspense } from "react";
import { RequestScreen } from "@/components/requests/request-screen";

export const metadata: Metadata = { title: "Заявка — Компас" };

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <RequestScreen id={id} />
    </Suspense>
  );
}
