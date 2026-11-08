import { cn } from "cn";
import { badgeLabel, type NavBadgeKey } from "./nav";

// Бейдж пункта навигации (SPEC §5.2): число или точка. Для чтения с экрана — текстом.
export function NavBadge({
  kind,
  value,
  className,
  withText = true,
}: {
  kind: NavBadgeKey;
  value: number | boolean | undefined;
  className?: string;
  /** false — только картинка; текст для чтения с экрана выводится отдельно <NavBadgeText>, после подписи. */
  withText?: boolean;
}) {
  const label = badgeLabel(kind, value);
  if (!label) return null;
  const count = typeof value === "number" ? (value > 99 ? "99+" : String(value)) : null;
  return (
    <>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none grid place-items-center rounded-full bg-accent text-xs leading-none font-semibold text-accent-ink tabular ring-2 ring-surface",
          count ? "h-5 min-w-5 px-1" : "size-2.5",
          className,
        )}
      >
        {count}
      </span>
      {withText && <span className="sr-only">, {label}</span>}
    </>
  );
}

export function NavBadgeText({
  kind,
  value,
}: {
  kind: NavBadgeKey;
  value: number | boolean | undefined;
}) {
  const label = badgeLabel(kind, value);
  return label ? <span className="sr-only">, {label}</span> : null;
}
