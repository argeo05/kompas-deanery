import type { Metadata } from "next";
import { Suspense } from "react";
import { StudyScreen } from "@/components/study/study-screen";

export const metadata: Metadata = { title: "Учёба — Компас" };

export default function StudyPage() {
  return (
    <Suspense>
      <StudyScreen />
    </Suspense>
  );
}
