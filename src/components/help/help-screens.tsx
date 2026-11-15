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
import type { KbArticleDTO, KbListDTO } from "@/contracts/api";
import { formatDayMonthFull } from "@/lib/format";
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
        <Button asChild className="self-start">
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
        {({ items }) => (
          <ul className="grid gap-3 lg:grid-cols-2">
            {items.map((a) => (
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
        )}
      </ApiView>
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
              <Button asChild variant="secondary">
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
