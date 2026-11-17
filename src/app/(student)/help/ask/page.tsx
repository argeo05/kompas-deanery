import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AskScreen } from "@/components/help/ask-screen";
import { readAssistantConfig } from "@/server/services/assistant-config";

export const metadata: Metadata = { title: "Спросить Компас — Компас" };

// Пока флаг AI_ASSISTANT выключен, экрана «нет»: 404, как у любого несуществующего адреса.
export default function AskPage() {
  const cfg = readAssistantConfig();
  if (!cfg.enabled) notFound();
  return <AskScreen mode={cfg.mode} />;
}
