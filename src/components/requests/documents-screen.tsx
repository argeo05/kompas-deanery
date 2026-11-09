"use client";

import Link from "next/link";
import { Download, ShieldCheck } from "lucide-react";
import { ApiView } from "@/components/screens/api-view";
import { useStudent } from "@/components/shell/student-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingRegion, SkeletonCard } from "@/components/ui/skeleton";
import type { DocumentsDTO } from "@/contracts/api";
import { formatDayMonthFull } from "@/lib/format";
import { useApi } from "@/lib/use-api";

// «Документы» (SPEC §6.5 п.7): выданные электронные справки, скачивание и ссылка проверки.

export function DocumentsScreen() {
  const { userId } = useStudent();
  const api = useApi<DocumentsDTO>("/api/me/documents", { scope: userId, refreshMs: 60_000 });
  return (
    <>
      <h1 className="type-h1">Документы</h1>
      <ApiView
        api={api}
        skeleton={
          <LoadingRegion label="Загружаем документы…">
            <SkeletonCard />
          </LoadingRegion>
        }
      >
        {({ items }) =>
          items.length === 0 ? (
            <EmptyState
              illustration="no-requests"
              title="Документов пока нет"
              action={
                <Button asChild>
                  <Link href="/requests/new">Заказать справку</Link>
                </Button>
              }
            >
              Готовые электронные справки появятся здесь, и их можно будет скачать.
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
              {items.map((d) => (
                <li key={d.id}>
                  <Card data-testid="document-row">
                    <h2 className="type-h3">{d.typeTitle}</h2>
                    <p className="type-caption text-ink-2">
                      Выдан {formatDayMonthFull(d.issuedAt)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild>
                        <a href={d.fileUrl} download>
                          <Download aria-hidden />
                          Скачать PDF
                        </a>
                      </Button>
                      <Button asChild variant="secondary">
                        <Link href={d.verifyUrl}>
                          <ShieldCheck aria-hidden />
                          Проверка подлинности
                        </Link>
                      </Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )
        }
      </ApiView>
    </>
  );
}
