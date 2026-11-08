import type { Metadata } from "next";
import { SessionScreen } from "@/components/study/session-screen";

export const metadata: Metadata = { title: "Сессия — Компас" };

export default function SessionPage() {
  return <SessionScreen />;
}
