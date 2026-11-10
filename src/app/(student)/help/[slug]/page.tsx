import type { Metadata } from "next";
import { Suspense } from "react";
import { HelpArticleScreen } from "@/components/help/help-screens";

export const metadata: Metadata = { title: "Справочник студента — Компас" };

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <Suspense>
      <HelpArticleScreen slug={slug} />
    </Suspense>
  );
}
