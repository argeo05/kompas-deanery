"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { Logo } from "./logo";
import { NavBadge } from "./nav-badge";
import {
  STAFF_NAV,
  STUDENT_MORE,
  STUDENT_TABS,
  isActive,
  type NavBadges,
  type NavItem,
} from "./nav";
import { ThemeToggle } from "./theme-toggle";
import type { ThemePref } from "@/lib/theme";

// Боковая панель (SPEC §5.2 десктоп, §5.3): ≥ 1024 px, 240 px. Разделы студента + развёрнутый
// пункт «Уведомления» и остальное из «Ещё»; внизу — переключатель темы.
function NavLink({
  item,
  pathname,
  badges,
}: {
  item: NavItem;
  pathname: string;
  badges: NavBadges;
}) {
  const active = isActive(pathname, item);
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-control px-2.5 py-2 text-ink-2 no-underline",
          "hover:bg-surface-2 hover:text-ink",
          "aria-[current=page]:bg-info-bg aria-[current=page]:font-semibold aria-[current=page]:text-info-fg",
        )}
      >
        <Icon aria-hidden strokeWidth={active ? 2.25 : 1.75} className="size-5 shrink-0" />
        <span className="flex-1">{item.label}</span>
        {item.badge && <NavBadge kind={item.badge} value={badges[item.badge]} />}
      </Link>
    </li>
  );
}

export function SideNav({
  role,
  badges = {},
  theme,
}: {
  role: "student" | "staff";
  badges?: NavBadges;
  theme: ThemePref;
}) {
  const pathname = usePathname();
  const primary = role === "student" ? STUDENT_TABS : STAFF_NAV;
  return (
    <div className="sticky top-0 hidden h-[calc(100dvh-var(--concept-bar-h))] w-(--sidebar-w) shrink-0 flex-col gap-6 overflow-y-auto border-r border-line bg-surface px-2 py-4 lg:flex">
      <Link
        href={role === "student" ? "/today" : "/staff/queue"}
        className="flex min-h-11 items-center rounded-control px-2.5 no-underline"
      >
        <Logo />
        <span className="sr-only">, на главную</span>
      </Link>
      <nav aria-label="Разделы" className="flex flex-1 flex-col gap-6">
        <ul className="flex flex-col gap-1">
          {primary.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} badges={badges} />
          ))}
        </ul>
        {role === "student" && (
          <ul className="flex flex-col gap-1 border-t border-line pt-4">
            {STUDENT_MORE.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} badges={badges} />
            ))}
          </ul>
        )}
      </nav>
      <ThemeToggle initial={theme} className="px-1" />
    </div>
  );
}
