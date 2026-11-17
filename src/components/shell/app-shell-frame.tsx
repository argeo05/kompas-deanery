import * as React from "react";
import { OfflineBar } from "@/components/ui/offline-bar";
import { ToastProvider } from "@/components/ui/toast";
import { ServiceWorkerManager } from "@/components/offline/service-worker-manager";
import type { ThemePref } from "@/lib/theme";
import { BottomNav } from "./bottom-nav";
import { CONCEPT_TEXT } from "./concept-bar";
import { FooterLinks } from "./footer-links";
import { SideNav } from "./side-nav";
import { TopBar } from "./top-bar";
import type { NavBadges } from "./nav";

// Оболочка кабинета (SPEC §5.2–5.5): боковая панель ≥ 1024 px, нижняя панель < 1024 px,
// шапка с колокольчиком и аватаром, индикатор сети, футер с текстом концепта.
// Полоса концепта и skip-link — в корневом layout: они нужны на всех страницах, не только в кабинете.
// Без серверных API: тот же каркас рисует офлайн-оболочка на клиенте.
export function AppShellFrame({
  role,
  initials,
  badges = {},
  theme,
  children,
}: {
  role: "student" | "staff";
  initials: string;
  badges?: NavBadges;
  theme: ThemePref;
  children: React.ReactNode;
}) {
  const unread = typeof badges.notifications === "number" ? badges.notifications : 0;
  return (
    <ToastProvider>
      <ServiceWorkerManager />
      <div className="flex min-h-dvh flex-1">
        <SideNav role={role} badges={badges} theme={theme} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar role={role} initials={initials} unread={unread} />
          <OfflineBar sticky className="sticky top-(--header-h) z-10" />
          <main
            id="content"
            tabIndex={-1}
            className="mx-auto flex w-full max-w-(--content-max) flex-1 flex-col gap-4 px-4 pt-4 pb-8 outline-none md:px-6 lg:gap-6 lg:pt-6"
          >
            {children}
          </main>
          <footer className="mx-auto w-full max-w-(--content-max) px-4 pt-4 pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+1rem)] text-xs text-ink-2 md:px-6 lg:pb-6">
            <p>{CONCEPT_TEXT}</p>
            <FooterLinks />
          </footer>
        </div>
      </div>
      <BottomNav role={role} badges={badges} theme={theme} />
    </ToastProvider>
  );
}
