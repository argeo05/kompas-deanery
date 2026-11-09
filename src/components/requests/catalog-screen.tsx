"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { ApiView } from "@/components/screens/api-view";
import { useStudent } from "@/components/shell/student-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingRegion, SkeletonCard } from "@/components/ui/skeleton";
import type { RequestTypeDTO, RequestTypesDTO } from "@/contracts/api";
import { plural } from "@/lib/format";
import { useApi } from "@/lib/use-api";

// Каталог заявок (SPEC §6.5 п.1): поиск по названию и синонимам («военкомат», «виза»),
// сверху «Частые». Подсказка «зачем» и срок — на каждой карточке.

const norm = (s: string) => s.toLowerCase().replaceAll("ё", "е").trim();

function matches(t: RequestTypeDTO, q: string): boolean {
  const needle = norm(q);
  return [t.title, t.hint, ...t.synonyms].some((s) => norm(s).includes(needle));
}

function TypeCard({ t }: { t: RequestTypeDTO }) {
  return (
    <Card variant="interactive" className="gap-1">
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 type-h3">
          <Link href={`/requests/new/${t.code}`} className="card-link">
            {t.title}
          </Link>
        </h3>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-2" />
      </div>
      <p className="text-ink-2">{t.hint}</p>
      <p className="type-caption text-ink-2">
        Срок: {t.slaDays} {plural(t.slaDays, ["рабочий день", "рабочих дня", "рабочих дней"])}
      </p>
    </Card>
  );
}

export function CatalogScreen() {
  const { userId } = useStudent();
  const [query, setQuery] = React.useState("");
  const api = useApi<RequestTypesDTO>("/api/request-types", { scope: userId });
  const searchId = React.useId();

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="type-h1">Новая заявка</h1>
        <p className="text-ink-2">
          Выберите справку или заявление. Остальное мы подставим из профиля.
        </p>
      </header>
      <div className="flex flex-col gap-1">
        <label htmlFor={searchId} className="type-caption text-ink-2">
          Поиск по названию
        </label>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-2"
          />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Например: военкомат, виза, общежитие"
            className="min-h-11 w-full rounded-control border border-line-strong bg-surface pr-3 pl-10 text-base text-ink"
          />
        </div>
      </div>
      <ApiView
        api={api}
        skeleton={
          <LoadingRegion label="Загружаем каталог…">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </LoadingRegion>
        }
      >
        {({ items }) => {
          const searching = query.trim() !== "";
          const found = searching ? items.filter((t) => matches(t, query)) : items;
          const popular = searching ? [] : items.filter((t) => t.popular).slice(0, 3);
          const rest = searching ? found : items.filter((t) => !popular.includes(t));
          if (searching && found.length === 0) {
            return (
              <EmptyState
                illustration="nothing-found"
                title="Ничего не нашли"
                action={
                  <Button asChild variant="secondary">
                    <Link href="/requests/new/app_free">Написать свободное заявление</Link>
                  </Button>
                }
              >
                Попробуйте другое слово. Если нужного типа нет, подойдёт свободное заявление.
              </EmptyState>
            );
          }
          return (
            <>
              {popular.length > 0 && (
                <section aria-labelledby="popular-title" className="flex flex-col gap-3">
                  <h2 id="popular-title" className="type-h2">
                    Частые
                  </h2>
                  <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-3">
                    {popular.map((t) => (
                      <li key={t.code}>
                        <TypeCard t={t} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <section aria-labelledby="all-title" className="flex flex-col gap-3">
                <h2 id="all-title" className="type-h2">
                  {searching ? "Найдено" : "Все типы"}
                </h2>
                <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-3">
                  {rest.map((t) => (
                    <li key={t.code}>
                      <TypeCard t={t} />
                    </li>
                  ))}
                </ul>
              </section>
            </>
          );
        }}
      </ApiView>
    </>
  );
}
