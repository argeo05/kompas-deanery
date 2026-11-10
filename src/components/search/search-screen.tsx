"use client";

import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/error-state";
import { GROUP_LABEL, useSearch } from "./use-search";

// Отдельный экран поиска (SPEC §6.10 п.1): на мобильной — полноэкранный, на десктопе его же открывает
// форма в шапке без JS. Запрос хранится в адресе (?q=), чтобы им можно было поделиться и вернуться назад.

export function SearchScreen({ initialQuery }: { initialQuery: string }) {
  const [q, setQ] = React.useState(initialQuery);
  const state = useSearch(q);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      const next = q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search";
      window.history.replaceState(null, "", next);
    }, 400);
    return () => window.clearTimeout(t);
  }, [q]);

  return (
    <>
      <h1 className="type-h1">Поиск</h1>
      <form
        role="search"
        onSubmit={(e) => e.preventDefault()}
        className="relative flex items-center"
      >
        <label htmlFor="search-q" className="sr-only">
          Что найти: пары, преподавателей, справки, статьи
        </label>
        <Search aria-hidden className="pointer-events-none absolute left-3 size-5 text-ink-2" />
        <input
          ref={inputRef}
          id="search-q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Например: военкомат, макро, 4012"
          autoComplete="off"
          className="min-h-12 w-full rounded-control border border-line-strong bg-surface pr-3 pl-10 text-base text-ink placeholder:text-ink-2"
        />
      </form>
      <div aria-live="polite" className="flex flex-col gap-4">
        {state.status === "idle" && (
          <p className="type-body text-ink-2">
            Введите хотя бы два символа. Ищем среди ваших пар, преподавателей, аудиторий, заявок,
            объявлений и статей справочника.
          </p>
        )}
        {state.status === "loading" && <p className="type-body text-ink-2">Ищем…</p>}
        {state.status === "error" && (
          <InlineError>
            {state.offline
              ? "Нет сети. Поиск заработает, когда она появится."
              : "Поиск сейчас не отвечает. Попробуйте ещё раз через минуту."}
          </InlineError>
        )}
        {state.status === "done" && state.data.groups.length === 0 && (
          <EmptyState
            illustration="nothing-found"
            title={`Ничего не нашли по «${state.data.q}»`}
            action={
              <>
                <Button asChild variant="secondary">
                  <Link href="/help">Открыть справочник</Link>
                </Button>
                <Button asChild>
                  <Link href="/support/new">Написать в деканат</Link>
                </Button>
              </>
            }
          >
            Проверьте написание или попробуйте другое слово.
          </EmptyState>
        )}
        {state.status === "done" &&
          state.data.groups.map((g) => (
            <section key={g.key} aria-labelledby={`sg-${g.key}`} className="flex flex-col gap-2">
              <h2 id={`sg-${g.key}`} className="type-h3 text-ink-2">
                {GROUP_LABEL[g.key]}
              </h2>
              <ul className="flex flex-col gap-1">
                {g.hits.map((h) => (
                  <li key={h.id + h.href}>
                    <Link
                      href={h.href}
                      className="flex min-h-11 flex-col justify-center rounded-control border border-line bg-surface px-3 py-2 no-underline hover:bg-surface-2"
                    >
                      <span className="type-body-strong text-ink">{h.title}</span>
                      {h.hint && <span className="type-caption text-ink-2">{h.hint}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </>
  );
}
