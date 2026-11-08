"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

// Вкладки раздела «Учёба» (SPEC §6.4): «Успеваемость» и «Сессия» — отдельные адреса, чтобы на сессию можно было дать ссылку.
const TABS = [
  { href: "/study", label: "Успеваемость" },
  { href: "/study/session", label: "Сессия" },
] as const;

export function StudyTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Разделы учёбы">
      <ul className="flex gap-1 border-b border-line">
        {TABS.map((t) => {
          const active = t.href === "/study" ? pathname === "/study" : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 type-body-strong no-underline",
                  active
                    ? "border-accent font-semibold text-ink"
                    : "border-transparent text-ink-2 hover:text-ink",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
