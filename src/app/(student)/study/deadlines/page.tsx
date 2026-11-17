import type { Metadata } from "next";
import { Suspense } from "react";
import { DeadlinesScreen } from "@/components/deadlines/deadlines-screen";

export const metadata: Metadata = { title: "Дедлайны — Компас" };

export default function DeadlinesPage() {
  return (
    <Suspense>
      <DeadlinesScreen />
    </Suspense>
  );
}
