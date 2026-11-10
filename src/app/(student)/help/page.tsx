import type { Metadata } from "next";
import { Suspense } from "react";
import { HelpListScreen } from "@/components/help/help-screens";

export const metadata: Metadata = { title: "Справочник студента — Компас" };

export default function HelpPage() {
  return (
    <Suspense>
      <HelpListScreen />
    </Suspense>
  );
}
