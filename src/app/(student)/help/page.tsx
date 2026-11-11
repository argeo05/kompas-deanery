import type { Metadata } from "next";
import { Suspense } from "react";
import { HelpListScreen } from "@/components/help/help-screens";
import { readAssistantConfig } from "@/server/services/assistant-config";

export const metadata: Metadata = { title: "Справочник студента — Компас" };

export default function HelpPage() {
  return (
    <Suspense>
      <HelpListScreen assistant={readAssistantConfig().enabled} />
    </Suspense>
  );
}
