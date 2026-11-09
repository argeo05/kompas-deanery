import type { Metadata } from "next";
import { Suspense } from "react";
import { DocumentsScreen } from "@/components/requests/documents-screen";

export const metadata: Metadata = { title: "Документы — Компас" };

export default function DocumentsPage() {
  return (
    <Suspense>
      <DocumentsScreen />
    </Suspense>
  );
}
