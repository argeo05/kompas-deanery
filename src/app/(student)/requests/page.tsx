import type { Metadata } from "next";
import { Suspense } from "react";
import { RequestsScreen } from "@/components/requests/requests-screen";

export const metadata: Metadata = { title: "Заявки — Компас" };

export default function RequestsPage() {
  return (
    <Suspense>
      <RequestsScreen />
    </Suspense>
  );
}
