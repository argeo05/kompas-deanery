import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogScreen } from "@/components/requests/catalog-screen";

export const metadata: Metadata = { title: "Новая заявка — Компас" };

export default function NewRequestPage() {
  return (
    <Suspense>
      <CatalogScreen />
    </Suspense>
  );
}
