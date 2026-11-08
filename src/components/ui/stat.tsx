import { cn } from "cn";

// Крупная цифра с подписью (SPEC §7.5 «Учёба»: средний балл, до сессии, задолженности).
export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div data-slot="stat" className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="font-display text-2xl tabular">{value}</dd>
      {hint && <dd className="text-xs text-ink-2">{hint}</dd>}
    </div>
  );
}
