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
      <dt className="type-caption text-ink-2">{label}</dt>
      <dd className="text-2xl type-num">{value}</dd>
      {hint && <dd className="type-caption text-ink-2">{hint}</dd>}
    </div>
  );
}
