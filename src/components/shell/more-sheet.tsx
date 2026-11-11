"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { NavBadge } from "./nav-badge";
import { STUDENT_MORE, isActive, type NavBadges } from "./nav";
import { SignOutButton } from "./sign-out-button";
import { ThemeToggle } from "./theme-toggle";
import type { ThemePref } from "@/lib/theme";

// Лист «Ещё» (SPEC §5.2): Уведомления, Связь с деканатом, Поиск, Профиль и настройки, О проекте.
export function MoreSheet({
  open,
  onOpenChange,
  badges,
  theme,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  badges: NavBadges;
  theme: ThemePref;
}) {
  const pathname = usePathname();

  // Лист живёт в нижней панели, которая скрыта на ≥ 1024 px. Окно расширили (поворот планшета) —
  // закрываем лист, иначе невидимый модальный диалог оставил бы страницу inert.
  React.useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(min-width: 64rem)");
    const onChange = () => mq.matches && onOpenChange(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [open, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Ещё">
      <ul className="flex flex-col">
        {STUDENT_MORE.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href} className="border-b border-line last:border-b-0">
              <Link
                href={item.href}
                onClick={() => onOpenChange(false)}
                aria-current={isActive(pathname, item) ? "page" : undefined}
                className="flex min-h-12 items-center gap-3 rounded-control py-2 text-ink no-underline aria-[current=page]:font-semibold aria-[current=page]:text-accent"
              >
                <Icon aria-hidden strokeWidth={1.75} className="size-5 shrink-0 text-ink-2" />
                <span className="flex-1">{item.label}</span>
                {item.badge && <NavBadge kind={item.badge} value={badges[item.badge]} />}
                <ChevronRight aria-hidden className="size-5 text-ink-2" />
              </Link>
            </li>
          );
        })}
      </ul>
      <SignOutButton className="mt-2 border-t border-line pt-2" />
      <ThemeToggle initial={theme} className="mt-4" />
    </Sheet>
  );
}
