import type { Metadata } from "next";
import { PrivacyScreen } from "@/components/profile/privacy-screen";

export const metadata: Metadata = { title: "Приватность — Компас" };

export default function PrivacyPage() {
  return <PrivacyScreen />;
}
