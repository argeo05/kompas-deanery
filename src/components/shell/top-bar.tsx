"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { LogoMark } from "./logo";
import { NavBadge } from "./nav-badge";
import { CommandPalette } from "@/components/search/command-palette";
import { SearchHint } from "./search-hint";

// Шапка (SPEC §5.5 п.3, §7.5): колокольчик с бейджем и аватар → профиль на каждом экране.
// На десктопе — строка поиска с подсказкой ⌘K / Ctrl K по платформе. Заголовок раздела — h1 в начале <main> страницы.
export function TopBar({
  role,
  initials,
  unread = 0,
}: {
  role: "student" | "staff";
  initials: string;
  unread?: number;
}) {
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  React.useEffect(() => {
    if (role !== "student") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [role]);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg">
      <div className="mx-auto flex h-(--header-h) max-w-(--content-max) items-center gap-2 px-4 md:px-6">
        <Link
          href={role === "student" ? "/today" : "/staff/queue"}
          className="-ml-1 grid size-11 place-items-center rounded-control lg:hidden"
        >
          <LogoMark />
          <span className="sr-only">Компас, на главную</span>
        </Link>
        <span className="flex-1 lg:hidden" />
        {role === "student" && (
          <button
            type="button"
            aria-keyshortcuts="Meta+K Control+K"
            aria-haspopup="dialog"
            onClick={() => setPaletteOpen(true)}
            className="relative hidden min-h-11 max-w-md flex-1 items-center rounded-control border border-line-strong bg-surface pr-20 pl-10 text-left text-base text-ink-2 lg:flex"
          >
            <Search aria-hidden className="pointer-events-none absolute left-3 size-5 text-ink-2" />
            Поиск: пары, заявки, дедлайны
            <SearchHint className="pointer-events-none absolute right-3 rounded-sm border border-line px-1.5 text-xs text-ink-2" />
          </button>
        )}
        {role === "student" && <span className="hidden flex-1 lg:block" />}
        {role === "student" && (
          <Link
            href="/search"
            className="grid size-11 place-items-center rounded-control text-ink hover:bg-surface-2 lg:hidden"
          >
            <Search aria-hidden strokeWidth={1.75} className="size-6" />
            <span className="sr-only">Поиск</span>
          </Link>
        )}
        {role === "staff" && <span className="hidden flex-1 lg:block" />}
        {role === "student" && (
          <Link
            href="/notifications"
            className="relative grid size-11 place-items-center rounded-control text-ink hover:bg-surface-2"
          >
            <Bell aria-hidden strokeWidth={1.75} className="size-6" />
            <span className="sr-only">Уведомления</span>
            <NavBadge kind="notifications" value={unread} className="absolute top-1.5 right-1" />
          </Link>
        )}
        <Link href="/profile" className="grid size-11 place-items-center rounded-full no-underline">
          <span
            aria-hidden
            className="grid size-9 place-items-center rounded-full bg-info-bg text-sm font-semibold text-info-fg"
          >
            {initials}
          </span>
          <span className="sr-only">Профиль</span>
        </Link>
      </div>
      {role === "student" && paletteOpen && (
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      )}
    </header>
  );
}
