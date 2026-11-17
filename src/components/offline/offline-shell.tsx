"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CatalogScreen } from "@/components/requests/catalog-screen";
import { DocumentsScreen } from "@/components/requests/documents-screen";
import { RequestFormScreen } from "@/components/requests/request-form-screen";
import { RequestScreen } from "@/components/requests/request-screen";
import { RequestsScreen } from "@/components/requests/requests-screen";
import { DeadlinesScreen } from "@/components/deadlines/deadlines-screen";
import { NotificationsScreen } from "@/components/notifications/notifications-screen";
import { ScheduleScreen } from "@/components/schedule/schedule-screen";
import { AppShellFrame } from "@/components/shell/app-shell-frame";
import { StudentProvider } from "@/components/shell/student-context";
import { SessionScreen } from "@/components/study/session-screen";
import { StudyScreen } from "@/components/study/study-screen";
import { SubjectScreen } from "@/components/study/subject-screen";
import { SupportScreen, TicketScreen } from "@/components/support/support-screens";
import { TodayScreen } from "@/components/today/today-screen";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingRegion, SkeletonCard } from "@/components/ui/skeleton";
import { useOnline } from "@/lib/offline/network";
import { isSignedOutPending, readDeviceUser, type DeviceUser } from "@/lib/offline/device-data";
import { finishPendingSignOut } from "@/lib/offline/sign-out";
import { OFFLINE_SECTIONS } from "@/lib/offline/policy";
import { THEME_COOKIE, parseTheme, type ThemePref } from "@/lib/theme";
import { OfflineSession } from "./offline-session";

// Офлайн-оболочка (SPEC §6.13, D-014). Service worker отдаёт эту страницу (из precache, без личных
// данных) вместо любой страницы, которая не загрузилась из-за сети. Оболочка смотрит на адрес и
// рисует тот же экран кабинета из данных в IndexedDB — только того, кто вошёл на этом устройстве.
// Никого нет (или вышли) — честная заглушка «Нет сети».

const UUID = "[0-9a-f-]{36}";

interface Route {
  title: string;
  render: (m: RegExpMatchArray) => React.ReactNode;
}

const ROUTES: [RegExp, Route][] = [
  [/^\/today$/, { title: "Сегодня", render: () => <TodayScreen /> }],
  [/^\/schedule$/, { title: "Расписание", render: () => <ScheduleScreen /> }],
  [/^\/study$/, { title: "Учёба", render: () => <StudyScreen /> }],
  [/^\/study\/session$/, { title: "Сессия", render: () => <SessionScreen /> }],
  [/^\/study\/deadlines$/, { title: "Дедлайны", render: () => <DeadlinesScreen /> }],
  [
    /^\/study\/subjects\/([^/]+)$/,
    { title: "Дисциплина", render: (m) => <SubjectScreen courseId={decodeURIComponent(m[1]!)} /> },
  ],
  [/^\/requests$/, { title: "Заявки", render: () => <RequestsScreen /> }],
  [/^\/requests\/new$/, { title: "Новая заявка", render: () => <CatalogScreen /> }],
  [
    /^\/requests\/new\/([\w-]+)$/,
    { title: "Новая заявка", render: (m) => <RequestFormScreen typeCode={m[1]!} /> },
  ],
  [
    new RegExp(`^/requests/(${UUID})$`, "i"),
    { title: "Заявка", render: (m) => <RequestScreen id={m[1]!} /> },
  ],
  [/^\/documents$/, { title: "Документы", render: () => <DocumentsScreen /> }],
  [
    /^\/notifications$/,
    { title: "Уведомления", render: () => <NotificationsScreen initialTab="all" /> },
  ],
  [/^\/support$/, { title: "Связь с деканатом", render: () => <SupportScreen /> }],
  [
    new RegExp(`^/support/(${UUID})$`, "i"),
    { title: "Обращение", render: (m) => <TicketScreen id={m[1]!} /> },
  ],
];

function matchRoute(pathname: string): { route: Route; m: RegExpMatchArray } | null {
  for (const [re, route] of ROUTES) {
    const m = pathname.match(re);
    if (m) return { route, m };
  }
  return null;
}

function themeFromCookie(): ThemePref {
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${THEME_COOKIE}=`))
    ?.split("=")[1];
  return parseTheme(raw);
}

type Phase =
  | { kind: "checking" }
  | { kind: "no-user" }
  | { kind: "signed-out" }
  | { kind: "ready"; user: DeviceUser; theme: ThemePref };

function Standalone({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-(--content-max) flex-1 flex-col gap-4 px-4 py-8 outline-none md:px-6"
    >
      {children}
    </main>
  );
}

function Retry() {
  return (
    <Button variant="secondary" onClick={() => window.location.reload()}>
      Повторить
    </Button>
  );
}

function NotOffline({ title }: { title?: string }) {
  return (
    <EmptyState
      illustration="offline"
      headingLevel="h1"
      title={title ? `«${title}» без сети не открывается` : "Этот раздел без сети не открывается"}
      action={
        <Button asChild>
          <Link href="/today">Открыть «Сегодня»</Link>
        </Button>
      }
    >
      Без интернета работают «Сегодня», расписание, учёба, заявки, документы и уведомления.
    </EmptyState>
  );
}

export function OfflineShell() {
  const pathname = usePathname();
  const online = useOnline();
  const [phase, setPhase] = React.useState<Phase>({ kind: "checking" });

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      const [user, signedOut] = await Promise.all([readDeviceUser(), isSignedOutPending()]);
      if (!alive) return;
      if (signedOut) return setPhase({ kind: "signed-out" });
      if (!user) return setPhase({ kind: "no-user" });
      const theme = themeFromCookie();
      document.documentElement.dataset.theme = theme;
      setPhase({ kind: "ready", user, theme });
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Выход без сети: как только связь вернулась, закрываем сессию на сервере.
  React.useEffect(() => {
    if (phase.kind !== "signed-out" || !online) return;
    void finishPendingSignOut().then((ok) => ok && window.location.replace("/login"));
  }, [phase.kind, online]);

  const match = matchRoute(pathname);
  React.useEffect(() => {
    const title =
      phase.kind === "ready"
        ? (match?.route.title ?? "Нет сети")
        : phase.kind === "signed-out"
          ? "Вы вышли"
          : "Нет сети";
    document.title = `${title} — Компас`;
  }, [phase.kind, match?.route.title]);

  if (phase.kind === "checking") {
    return (
      <Standalone>
        <LoadingRegion label="Открываем сохранённые данные…">
          <SkeletonCard />
        </LoadingRegion>
      </Standalone>
    );
  }

  if (phase.kind === "signed-out") {
    return (
      <Standalone>
        <EmptyState
          illustration="offline"
          headingLevel="h1"
          title="Вы вышли из Компаса"
          action={
            online ? (
              <Button asChild>
                <Link href="/login">Войти</Link>
              </Button>
            ) : (
              <Retry />
            )
          }
        >
          Данные на этом устройстве стёрты. Войти снова можно, когда появится интернет.
        </EmptyState>
      </Standalone>
    );
  }

  if (phase.kind === "no-user") {
    return (
      <Standalone>
        <EmptyState illustration="offline" headingLevel="h1" title="Нет сети" action={<Retry />}>
          Откройте приложение, когда появится интернет, — мы сохраним данные, чтобы открывать Компас
          без интернета.
        </EmptyState>
      </Standalone>
    );
  }

  const known = OFFLINE_SECTIONS.some((s) => pathname === s || pathname.startsWith(`${s}/`));
  return (
    <AppShellFrame role="student" initials={phase.user.initials} theme={phase.theme}>
      <StudentProvider value={{ userId: phase.user.userId, displayName: phase.user.displayName }}>
        <OfflineSession user={phase.user} />
        <React.Suspense>
          {match && known ? match.route.render(match.m) : <NotOffline title={match?.route.title} />}
        </React.Suspense>
      </StudentProvider>
    </AppShellFrame>
  );
}
