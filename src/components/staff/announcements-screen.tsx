"use client";

import * as React from "react";
import Link from "next/link";
import { Archive, Megaphone, Plus, TriangleAlert } from "lucide-react";
import { ApiView } from "@/components/screens/api-view";
import { useStaff } from "@/components/shell/staff-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingRegion, SkeletonCard } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import type { Paged, StaffAnnouncementDTO, StaffReferenceDTO } from "@/contracts/api";
import { formatDayMonth, formatTimeMsk } from "@/lib/format";
import { sendJson } from "@/lib/send-json";
import { useApi } from "@/lib/use-api";

// Объявления сотрудника (SPEC §6.9 п.3): список со статусом публикации и аудиторией, архивирование.

function audienceText(a: StaffAnnouncementDTO["audience"], ref: StaffReferenceDTO | undefined) {
  const parts: string[] = [];
  if (a.facultyIds?.length) {
    const names = a.facultyIds.map(
      (id) => ref?.faculties.find((f) => f.id === id)?.title ?? "факультет",
    );
    parts.push(names.join(", "));
  }
  if (a.courses?.length) parts.push(`курс: ${a.courses.join(", ")}`);
  if (a.groupIds?.length) {
    const names = a.groupIds.map((id) => ref?.groups.find((g) => g.id === id)?.title ?? "группа");
    parts.push(`группы: ${names.join(", ")}`);
  }
  return parts.join(" · ") || "Не указана";
}

function Row({
  a,
  ref,
  now,
  onArchive,
}: {
  a: StaffAnnouncementDTO;
  ref: StaffReferenceDTO | undefined;
  now: number;
  onArchive: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  const archived = a.archivedAt !== null;
  const scheduled = !archived && new Date(a.publishAt).getTime() > now;
  const expired = !archived && a.expiresAt !== null && new Date(a.expiresAt).getTime() < now;
  return (
    <Card data-testid="announcement-row">
      <div className="flex flex-wrap items-center gap-2">
        {a.important && (
          <Badge tone="coral" icon={TriangleAlert}>
            Важно
          </Badge>
        )}
        <Badge tone={archived || expired ? "neutral" : scheduled ? "info" : "ok"}>
          {archived
            ? "В архиве"
            : expired
              ? "Срок истёк"
              : scheduled
                ? "Запланировано"
                : "Опубликовано"}
        </Badge>
      </div>
      <h2 className="type-h3">{a.title}</h2>
      <p className="type-caption text-ink-2">
        {formatDayMonth(a.publishAt)}, {formatTimeMsk(a.publishAt)} · {a.author}
      </p>
      <p className="type-caption text-ink-2">Аудитория: {audienceText(a.audience, ref)}</p>
      {!archived && (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await onArchive(a.id);
            setBusy(false);
          }}
        >
          <Archive aria-hidden />
          Убрать в архив
        </Button>
      )}
    </Card>
  );
}

export function AnnouncementsScreen() {
  const { userId } = useStaff();
  const toast = useToast();
  const api = useApi<Paged<StaffAnnouncementDTO>>("/api/staff/announcements?limit=50", {
    scope: userId,
    refreshMs: 60_000,
  });
  const ref = useApi<StaffReferenceDTO>("/api/staff/reference", { scope: userId });
  const [now] = React.useState(() => Date.now());

  const archive = async (id: string) => {
    const res = await sendJson("POST", `/api/staff/announcements/${id}/archive`);
    if (res.ok || res.status === 409) {
      toast({ tone: "success", title: "Объявление убрано в архив" });
      api.reload();
    } else toast({ tone: "error", title: "Не получилось убрать в архив. Повторите." });
  };

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="type-h1">Объявления</h1>
        <Button asChild>
          <Link href="/staff/announcements/new">
            <Plus aria-hidden />
            Новое объявление
          </Link>
        </Button>
      </header>
      <ApiView
        api={api}
        skeleton={
          <LoadingRegion label="Загружаем объявления…">
            <SkeletonCard />
            <SkeletonCard />
          </LoadingRegion>
        }
      >
        {(page) =>
          page.items.length === 0 ? (
            <EmptyState
              illustration="free-day"
              title="Объявлений пока нет"
              action={
                <Button asChild>
                  <Link href="/staff/announcements/new">
                    <Megaphone aria-hidden />
                    Написать первое
                  </Link>
                </Button>
              }
            >
              Здесь появятся объявления вашего подразделения.
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
              {page.items.map((a) => (
                <li key={a.id}>
                  <Row a={a} ref={ref.data} now={now} onArchive={archive} />
                </li>
              ))}
            </ul>
          )
        }
      </ApiView>
    </>
  );
}
