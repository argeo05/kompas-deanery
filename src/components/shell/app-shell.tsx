import * as React from "react";
import { cookies } from "next/headers";
import { OfflineBar } from "@/components/ui/offline-bar";
import { ToastProvider } from "@/components/ui/toast";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { BottomNav } from "./bottom-nav";
import { CONCEPT_TEXT } from "./concept-bar";
import { SideNav } from "./side-nav";
import { TopBar } from "./top-bar";
import type { NavBadges } from "./nav";

// Оболочка кабинета (SPEC §5.2–5.5): боковая панель ≥ 1024 px, нижняя панель < 1024 px,
// шапка с колокольчиком и аватаром, индикатор сети, футер с текстом концепта.
// Полоса концепта и skip-link — в корневом layout: они нужны на всех страницах, не только в кабинете.
export async function AppShell({
  role,
  initials,
  badges = {},
  children,
}: {
  role: "student" | "staff";
  /** Инициалы для аватара, например «АС». */
  initials: string;
  badges?: NavBadges;
  children: React.ReactNode;
}) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const unread = typeof badges.notifications === "number" ? badges.notifications : 0;
  return (
    <ToastProvider>
      <div className="flex min-h-dvh flex-1">
        <SideNav role={role} badges={badges} theme={theme} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar role={role} initials={initials} unread={unread} />
          <OfflineBar className="sticky top-(--header-h) z-10" />
          <main
            id="content"
            tabIndex={-1}
            className="mx-auto flex w-full max-w-(--content-max) flex-1 flex-col gap-6 px-4 pt-4 pb-8 outline-none md:px-6 lg:pt-6"
          >
            {children}
          </main>
          <footer className="mx-auto w-full max-w-(--content-max) px-4 pt-4 pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+1rem)] text-xs text-ink-2 md:px-6 lg:pb-6">
            {CONCEPT_TEXT}
          </footer>
        </div>
      </div>
      <BottomNav role={role} badges={badges} theme={theme} />
    </ToastProvider>
  );
}
