import * as React from "react";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { AppShellFrame } from "./app-shell-frame";
import type { NavBadges } from "./nav";

// Оболочка кабинета на сервере: тема из cookie. Разметка — в AppShellFrame, её же рисует
// офлайн-оболочка /offline на клиенте (SPEC §6.13, D-014).
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
  return (
    <AppShellFrame role={role} initials={initials} badges={badges} theme={theme}>
      {children}
    </AppShellFrame>
  );
}
