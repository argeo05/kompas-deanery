"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Sparkles } from "lucide-react";
import { ApiView } from "@/components/screens/api-view";
import { useStudent } from "@/components/shell/student-context";
import { Button } from "@/components/ui/button";
import { Card, CardLink } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingRegion, SkeletonCard } from "@/components/ui/skeleton";
import { Field, TextInput } from "@/components/ui/field";
import type { KbArticleDTO, KbItemDTO, KbListDTO } from "@/contracts/api";
import { formatDayMonthFull } from "@/lib/format";
import { queryStems } from "@/lib/assistant/engine";
import { normalizeQuery } from "@/lib/search-synonyms";
import { SafeMarkdown } from "@/lib/markdown";
import { useApi } from "@/lib/use-api";

// Справочник студента (SPEC §11.4): список статей и статья. Правила вымышленные, это сказано в тексте.

export function HelpListScreen({ assistant = false }: { assistant?: boolean }) {
  const { userId } = useStudent();
  const api = useApi<KbListDTO>("/api/me/kb", { scope: userId });
  return (
    <>
      <h1 className="type-h1">Справочник студента</h1>
      <p className="type-body text-ink-2">
        Как пересдать, оформить академический отпуск, получить справку. Правила вымышленные: это
        концепт. Не нашли ответ? <Link href="/support/new">Напишите в деканат</Link>.
      </p>
      {assistant && (
        <Button asChild className="max-w-full self-start whitespace-normal">
          <Link href="/help/ask">
            <Sparkles aria-hidden />
            Спросить Компас
          </Link>
        </Button>
      )}
      <ApiView
        api={api}
        skeleton={
          <LoadingRegion label="Загружаем справочник…">
            <SkeletonCard />
            <SkeletonCard />
          </LoadingRegion>
        }
      >
        {({ items }) => <ArticleIndex items={items} />}
      </ApiView>
    </>
  );
}

function ArticleIndex({ items }: { items: KbItemDTO[] }) {
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const needle = normalizeQuery(query);
  const words = needle
    .split(" ")
    .map(queryStems)
    .filter((alternatives) => alternatives.length > 0);
  const matches = items.filter((item) => {
    const text = normalizeQuery([item.title, ...item.tags].join(" "));
    return (
      text.includes(needle) ||
      (words.length > 0 &&
        words.every((alternatives) => alternatives.some((word) => text.includes(word))))
    );
  });

  return (
    <>
      <Field label="Поиск по справочнику">
        {(props) => (
          <TextInput
            {...props}
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Например, пересдача или общежитие"
          />
        )}
      </Field>
      <p role="status" className="type-caption text-ink-2">
        {needle ? `Найдено статей: ${matches.length}` : `Статей в справочнике: ${items.length}`}
      </p>
      {matches.length > 0 ? (
        <ul className="grid gap-3 lg:grid-cols-2">
          {matches.map((a) => (
            <li key={a.slug}>
              <Card variant="interactive" className="gap-1 p-3">
                <h2 className="type-body-strong">
                  <CardLink href={`/help/${a.slug}`}>{a.title}</CardLink>
                </h2>
                {a.tags.length > 0 && (
                  <p className="type-caption text-ink-2">{a.tags.slice(0, 3).join(", ")}</p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      ) : needle && items.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p>Попробуйте другую тему или вернитесь к списку.</p>
          <Button
            type="button"
            variant="secondary"
            className="max-w-full whitespace-normal"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
          >
            Показать все статьи
          </Button>
        </div>
      ) : null}
    </>
  );
}

export function HelpArticleScreen({ slug }: { slug: string }) {
  const { userId } = useStudent();
  const api = useApi<KbArticleDTO>(`/api/me/kb/${slug}`, { scope: userId });
  return (
    <>
      <Button asChild variant="link" size="sm" className="self-start">
        <Link href="/help">
          <ArrowLeft aria-hidden className="size-4" />
          Справочник
        </Link>
      </Button>
      <ApiView
        api={api}
        skeleton={
          <LoadingRegion label="Загружаем статью…">
            <SkeletonCard />
          </LoadingRegion>
        }
        notFound={
          <EmptyState
            illustration="nothing-found"
            title="Статья не найдена"
            action={
              <Button asChild>
                <Link href="/help">К справочнику</Link>
              </Button>
            }
          >
            Возможно, ссылка устарела.
          </EmptyState>
        }
      >
        {(a) => (
          <article className="flex max-w-2xl flex-col gap-3">
            <h1 className="type-h1">{a.title}</h1>
            <p className="type-caption text-ink-2">Обновлено {formatDayMonthFull(a.updatedAt)}</p>
            <SafeMarkdown
              source={a.bodyMd}
              className="flex flex-col gap-3 type-body [&_h3]:mt-2 [&_li]:mb-1"
            />
            <p>
              <Button asChild variant="secondary" className="max-w-full whitespace-normal">
                <Link href={`/support/new?topic=other`}>
                  <BookOpen aria-hidden />
                  Не нашли ответ? Написать в деканат
                </Link>
              </Button>
            </p>
          </article>
        )}
      </ApiView>
    </>
  );
}
