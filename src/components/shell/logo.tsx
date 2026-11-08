import { cn } from "cn";

// Знак «Компас» (SPEC §7.3): скруглённый квадрат цвета --ink, внутри стрелка-ромб
// (верх --accent, низ --surface). Без отсылок к гербу, щиту, глобусу и цветам МГИМО (C-20).
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      focusable="false"
      className={cn("size-8 shrink-0", className)}
    >
      <rect width="32" height="32" rx="9" className="fill-ink" />
      <path d="M16 5 22 16H10z" className="fill-accent" />
      <path d="M10 16h12l-6 11z" className="fill-surface" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold text-ink", className)}>
      <LogoMark />
      <span className="type-h3">Компас</span>
    </span>
  );
}
