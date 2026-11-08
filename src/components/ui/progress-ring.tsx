import { cn } from "cn";

// Кольцо прогресса (SPEC §6.4 п.2): набранные баллы к максимуму «на сегодня». Число внутри кольца
// и текстовая подпись дублируют дугу: смысл не держится на одном рисунке.

export function ProgressRing({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  /** Текст для чтения с экрана. */
  label: string;
  className?: string;
}) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <span
      role="img"
      aria-label={label}
      className={cn("relative inline-grid size-14 shrink-0 place-items-center", className)}
    >
      <svg viewBox="0 0 48 48" className="size-full -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r={r} className="fill-none stroke-line" strokeWidth="5" />
        <circle
          cx="24"
          cy="24"
          r={r}
          className="fill-none stroke-accent"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - share)}
        />
      </svg>
      <span aria-hidden className="absolute text-sm type-num">
        {Math.round(value)}
      </span>
    </span>
  );
}
