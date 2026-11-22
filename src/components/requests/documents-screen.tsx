"use client";

import Link from "next/link";
import { Plus, ShieldCheck } from "lucide-react";
import { DocumentDownload, SavedOfflineBadge } from "@/components/offline/document-download";
import { ApiView } from "@/components/screens/api-view";
import { useStudent } from "@/components/shell/student-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingRegion, SkeletonCard } from "@/components/ui/skeleton";
import type { DocumentsDTO } from "@/contracts/api";
import { formatDayMonthFull, formatTimeMsk } from "@/lib/format";
import { useApi } from "@/lib/use-api";

// «Документы» (SPEC §6.5 п.7): выданные электронные справки, скачивание и ссылка проверки.
// Каждая справка сохраняется на телефоне (§6.13): метка «Есть на телефоне», скачивание без сети.

export function DocumentsScreen() {
  const { userId } = useStudent();
  const api = useApi<DocumentsDTO>("/api/me/documents", { scope: userId, refreshMs: 60_000 });
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="type-h1">Документы</h1>
        <Button asChild className="max-w-full py-2 whitespace-normal">
          <Link href="/requests/new">
            <Plus aria-hidden />
            Заказать справку
          </Link>
        </Button>
      </header>
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
            <EmptyState illustration="no-requests" title="Документов пока нет">
              Готовые документы появятся здесь, их можно будет скачать.
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
              {items.map((d) => (
                <li key={d.id}>
                  <Card data-testid="document-row">
                    <h2 className="type-h3">{d.typeTitle}</h2>
                    <p className="type-caption text-ink-2">
                      Выдан{" "}
                      <time dateTime={d.issuedAt}>
                        {formatDayMonthFull(d.issuedAt)} в {formatTimeMsk(d.issuedAt)}
                      </time>
                    </p>
                    <SavedOfflineBadge url={d.fileUrl} />
                    <div className="flex flex-wrap gap-2">
                      <DocumentDownload url={d.fileUrl} fileName={`${d.typeTitle}.pdf`} />
                      <Button
                        asChild
                        variant="secondary"
                        className="max-w-full py-2 whitespace-normal"
                      >
                        <Link href={d.verifyUrl}>
                          <ShieldCheck aria-hidden />
                          Проверить подлинность
                        </Link>
                      </Button>
                    </div>
                    <Link
                      href={`/requests/${d.requestId}`}
                      prefetch={false}
                      className="inline-flex min-h-11 items-center self-start text-accent underline"
                    >
                      Открыть заявку
                      <span className="sr-only">
                        {" "}
                        на документ «{d.typeTitle}» от {formatDayMonthFull(d.issuedAt)},{" "}
                        {formatTimeMsk(d.issuedAt)}
                      </span>
                    </Link>
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
