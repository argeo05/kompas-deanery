import type { Metadata } from "next";
import { Suspense } from "react";
import { SupportScreen } from "@/components/support/support-screens";

export const metadata: Metadata = { title: "Связь с деканатом — Компас" };

export default function SupportPage() {
  return (
    <Suspense>
      <SupportScreen />
    </Suspense>
  );
}
