"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { NavBadge, NavBadgeText } from "./nav-badge";
import { MORE_TAB, STAFF_NAV, STUDENT_MORE, STUDENT_TABS, isActive, type NavBadges } from "./nav";
import { MoreSheet } from "./more-sheet";
import type { ThemePref } from "@/lib/theme";

// Нижняя панель (SPEC §5.2, §7.4 BottomNav): < 1024 px, 5 пунктов с подписями, 64 px + safe-area.
const itemClass = cn(
  "relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-control px-0.5 pt-1 no-underline hyphens-none",
  "text-ink-2 hover:text-ink aria-[current=page]:text-accent aria-[current=page]:[&_.type-nav]:font-semibold aria-expanded:text-accent",
  // Активный пункт отмечен не только цветом: подложка под иконкой, как в боковой панели (1.4.1).
  "[&[aria-current=page]_.nav-icon]:bg-info-bg [&[data-active]_.nav-icon]:bg-info-bg",
);

export function BottomNav({
  role,
  badges = {},
  theme,
}: {
  role: "student" | "staff";
  badges?: NavBadges;
  theme: ThemePref;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const listRef = React.useRef<HTMLUListElement>(null);
  const tabs = role === "student" ? STUDENT_TABS : STAFF_NAV;
  const moreActive = role === "student" && STUDENT_MORE.some((i) => isActive(pathname, i));

  // Перенос подписей меняет высоту панели. Футер, фокус и уведомления уже учитывают эту переменную.
  React.useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      const height = list.offsetHeight;
      if (height) root.style.setProperty("--bottom-nav-h", `${height}px`);
      else root.style.removeProperty("--bottom-nav-h");
    });
    observer.observe(list);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--bottom-nav-h");
    };
  }, []);

  return (
    <nav
      aria-label="Основные разделы"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-safe lg:hidden"
    >
      <ul ref={listRef} className="mx-auto flex min-h-16 max-w-xl items-stretch px-1 py-1">
        {tabs.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={itemClass}
              >
                <span className="nav-icon relative flex w-full max-w-12 justify-center rounded-full py-0.5">
                  <Icon aria-hidden strokeWidth={active ? 2.25 : 1.75} className="size-6" />
                  {item.badge && (
                    <NavBadge
                      kind={item.badge}
                      value={badges[item.badge]}
                      withText={false}
                      className="absolute -top-1 right-0"
                    />
                  )}
                </span>
                {/* WCAG 2.5.3: доступное имя начинается с видимой подписи; полное имя пункта идёт следом («Пары, расписание»). */}
                <span className="max-w-full text-center type-nav wrap-anywhere">
                  {item.short ?? item.label}
                </span>
                {item.short && !item.label.startsWith(item.short) && (
                  <span className="sr-only">, {item.label.toLowerCase()}</span>
                )}
                {item.badge && <NavBadgeText kind={item.badge} value={badges[item.badge]} />}
              </Link>
            </li>
          );
        })}
        {role === "student" && (
          <li className="flex min-w-0 flex-1">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen(true)}
              data-active={moreActive || undefined}
              className={cn(itemClass, moreActive && "text-accent [&_.type-nav]:font-semibold")}
            >
              <span className="nav-icon relative flex w-full max-w-12 justify-center rounded-full py-0.5">
                <MORE_TAB.icon
                  aria-hidden
                  strokeWidth={moreActive ? 2.25 : 1.75}
                  className="size-6"
                />
                <NavBadge
                  kind="more"
                  value={badges.more}
                  withText={false}
                  className="absolute -top-1 right-0"
                />
              </span>
              <span className="max-w-full text-center type-nav wrap-anywhere">
                {MORE_TAB.label}
              </span>
              <NavBadgeText kind="more" value={badges.more} />
              {moreActive && <span className="sr-only">, открыт раздел из этого меню</span>}
            </button>
          </li>
        )}
      </ul>
      {role === "student" && (
        <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} badges={badges} theme={theme} />
      )}
    </nav>
  );
}
