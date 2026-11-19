"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Megaphone, Settings } from "lucide-react";
import { ApiView } from "@/components/screens/api-view";
import { useStudent } from "@/components/shell/student-context";
import { Button } from "@/components/ui/button";
import { Card, CardLink } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingRegion, SkeletonCard } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/status-badge";
import type {
  AnnouncementDTO,
  NotificationDTO,
  NotificationPrefsDTO,
  NotificationsDTO,
  NotificationsTab,
  Paged,
} from "@/contracts/api";
import { digestSlot } from "@/lib/digest";
import { formatDateLong, formatDayMonth, formatTimeMsk } from "@/lib/format";
import { SafeMarkdown } from "@/lib/markdown";
import { linkActionLabel, linkHref } from "@/lib/notification-link";
import { sendJson } from "@/lib/send-json";
import { toMsk } from "@/lib/time";
import { useApi } from "@/lib/use-api";
import { cn } from "cn";

// Центр уведомлений (SPEC §6.6): вкладки «Все» / «Важное» / «Объявления», группировка по дням,
// непрочитанные выделены текстом и точкой, «Отметить всё прочитанным». Каждое уведомление — ссылка
// на цель. Вкладка и якорь хранятся в адресе, чтобы ссылка из «Сегодня» вела прямо на объявление.

const TABS: { id: NotificationsTab; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "important", label: "Важное" },
  { id: "announcements", label: "Объявления" },
];

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function dayTitle(iso: string, today: string): string {
  const d = dayKey(iso);
  if (d === today) return "Сегодня";
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (d === yesterday.toISOString().slice(0, 10)) return "Вчера";
  return formatDateLong(iso);
}

function NotificationRow({
  n,
  onOpen,
}: {
  n: NotificationDTO;
  onOpen: (n: NotificationDTO) => void;
}) {
  const unread = n.readAt === null;
  return (
    <Card variant="interactive" className={cn("gap-1 p-3", unread && "border-accent")}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 type-body-strong">
          <CardLink href={linkHref(n.link.kind, n.link.id)} onClick={() => onOpen(n)}>
            {unread && <span className="sr-only">Новое. </span>}
            {n.category === "plan" && n.title === "Время для плана"
              ? "Ваш план по дедлайну"
              : n.title}
          </CardLink>
        </h3>
        {unread && <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full bg-accent" />}
      </div>
      <p className="type-body text-ink-2">{n.body}</p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 type-caption text-ink-2">
        <span>{formatTimeMsk(n.deliverAt)}</span>
        {n.class === "urgent" && <Badge tone="warn">Срочно</Badge>}
        <span className="text-accent">{linkActionLabel(n.link.kind)}</span>
      </p>
    </Card>
  );
}

function AnnouncementCard({ a }: { a: AnnouncementDTO }) {
  const [open, setOpen] = React.useState(false);
  const long = a.bodyMd.length > 220;
  return (
    <Card id={`a-${a.id}`} className="scroll-mt-24 gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="type-h3">{a.title}</h3>
        {a.important && (
          <Badge tone="warn" icon={Megaphone}>
            Важно
          </Badge>
        )}
      </div>
      <p className="type-caption text-ink-2">
        {formatDayMonth(a.publishedAt)}
        {a.expiresAt ? ` · актуально до ${formatDayMonth(a.expiresAt)}` : ""}
      </p>
      <SafeMarkdown
        source={long && !open ? `${a.bodyMd.slice(0, 220).trimEnd()}…` : a.bodyMd}
        className="flex flex-col gap-2 type-body [&_a]:underline"
      />
      {long && (
        <Button
          variant="link"
          size="sm"
          className="self-start"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Свернуть" : "Читать полностью"}
        </Button>
      )}
    </Card>
  );
}

function Announcements() {
  const { userId } = useStudent();
  const api = useApi<Paged<AnnouncementDTO>>("/api/me/announcements?limit=50", {
    scope: userId,
    refreshMs: 60_000,
  });
  // Переход по якорю #a-… после того, как карточки появились.
  React.useEffect(() => {
    if (!api.data) return;
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [api.data]);
  return (
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
          <EmptyState illustration="nothing-found" title="Объявлений нет">
            Когда деканат что-то опубликует для вашей группы, это появится здесь.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {page.items.map((a) => (
              <li key={a.id}>
                <AnnouncementCard a={a} />
              </li>
            ))}
          </ul>
        )
      }
    </ApiView>
  );
}

function nextDigestText(prefs: NotificationPrefsDTO | undefined): string | null {
  if (!prefs) return null;
  const at = digestSlot(toMsk(new Date()), prefs.slots, {
    from: prefs.quietFrom,
    to: prefs.quietTo,
  });
  return `Следующий дайджест — в ${formatTimeMsk(at)}.`;
}

function Feed({ tab }: { tab: Exclude<NotificationsTab, "announcements"> }) {
  const { userId } = useStudent();
  const [extra, setExtra] = React.useState<NotificationDTO[]>([]);
  const [cursor, setCursor] = React.useState<string | null | undefined>(undefined);
  const [readIds, setReadIds] = React.useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = React.useState(false);
  const api = useApi<NotificationsDTO>(`/api/me/notifications?tab=${tab}&limit=20`, {
    scope: userId,
    refreshMs: 30_000,
  });
  const prefs = useApi<NotificationPrefsDTO>("/api/me/notification-prefs", { scope: userId });
  const [today] = React.useState(() => toMsk(new Date()).slice(0, 10));

  const markAllRead = async () => {
    const res = await sendJson("POST", "/api/me/notifications/read", { all: true });
    if (res.ok) {
      setReadIds(new Set(["*"]));
      api.reload();
    }
  };
  const open = (n: NotificationDTO) => {
    if (n.readAt === null) void sendJson("POST", "/api/me/notifications/read", { ids: [n.id] });
  };
  const loadMore = async (from: string) => {
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/me/notifications?tab=${tab}&limit=20&cursor=${encodeURIComponent(from)}`,
        {
          credentials: "same-origin",
          cache: "no-store",
        },
      );
      if (res.ok) {
        const page = (await res.json()) as NotificationsDTO;
        setExtra((prev) => [...prev, ...page.items]);
        setCursor(page.nextCursor);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <ApiView
      api={api}
      skeleton={
        <LoadingRegion label="Загружаем уведомления…">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </LoadingRegion>
      }
    >
      {(page) => {
        const all = [...page.items, ...extra].map((n) =>
          readIds.has("*") && n.readAt === null ? { ...n, readAt: "read" } : n,
        );
        const next = cursor === undefined ? page.nextCursor : cursor;
        const unread = all.filter((n) => n.readAt === null).length;
        if (all.length === 0) {
          return (
            <EmptyState illustration="all-done" title="Новых уведомлений нет">
              {nextDigestText(prefs.data) ?? "Мы напишем, когда появится что-то важное."}
            </EmptyState>
          );
        }
        const byDay = new Map<string, NotificationDTO[]>();
        for (const n of all)
          byDay.set(dayKey(n.deliverAt), [...(byDay.get(dayKey(n.deliverAt)) ?? []), n]);
        return (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="type-caption text-ink-2" role="status">
                {unread > 0 ? `Непрочитанных: ${unread}` : "Всё прочитано"}
              </p>
              <Button variant="secondary" size="sm" disabled={unread === 0} onClick={markAllRead}>
                Отметить всё прочитанным
              </Button>
            </div>
            {[...byDay.entries()].map(([day, items]) => (
              <section key={day} aria-labelledby={`day-${day}`} className="flex flex-col gap-2">
                <h2 id={`day-${day}`} className="type-h3 text-ink-2">
                  {dayTitle(items[0]!.deliverAt, today)}
                </h2>
                <ul className="flex flex-col gap-2">
                  {items.map((n) => (
                    <li key={n.id}>
                      <NotificationRow n={n} onOpen={open} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {next && (
              <Button
                variant="secondary"
                className="self-center"
                loading={loadingMore}
                onClick={() => loadMore(next)}
              >
                Показать ещё
              </Button>
            )}
          </>
        );
      }}
    </ApiView>
  );
}

export function NotificationsScreen({ initialTab }: { initialTab: NotificationsTab }) {
  const [tab, setTab] = React.useState<NotificationsTab>(initialTab);
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="type-h1">Уведомления</h1>
        <Button asChild variant="secondary" size="sm">
          <Link href="/notifications/settings">
            <Settings aria-hidden className="size-4" />
            Настройки
          </Link>
        </Button>
      </header>
      <div role="group" aria-label="Что показать" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button
            key={t.id}
            variant={tab === t.id ? "primary" : "secondary"}
            size="sm"
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.id === "all" && <Bell aria-hidden className="size-4" />}
            {t.label}
          </Button>
        ))}
      </div>
      {tab === "announcements" ? <Announcements /> : <Feed key={tab} tab={tab} />}
    </>
  );
}
