import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchScreen } from "@/components/search/search-screen";

export const metadata: Metadata = { title: "Поиск — Компас" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return (
    <Suspense>
      <SearchScreen initialQuery={(q ?? "").slice(0, 80)} />
    </Suspense>
  );
}
