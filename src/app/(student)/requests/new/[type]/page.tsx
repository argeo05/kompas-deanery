import type { Metadata } from "next";
import { Suspense } from "react";
import { RequestFormScreen } from "@/components/requests/request-form-screen";

export const metadata: Metadata = { title: "Заявка — Компас" };

export default async function RequestFormPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  return (
    <Suspense>
      <RequestFormScreen typeCode={type} />
    </Suspense>
  );
}
