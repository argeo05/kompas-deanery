import { formatTimeMsk } from "@/lib/format";

// Линия «сейчас» — чернильный штрих (SPEC §7.2a п.2): капля 8 px в начале, путь 2 px --accent
// с неровностью ≤ 1 px, подпись времени. Без анимации: время обновляется раз в минуту.
export function NowLine({ now }: { now: Date }) {
  return (
    <li className="flex items-center gap-2 text-accent" data-slot="now-line">
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-accent" />
      <svg
        aria-hidden
        focusable="false"
        viewBox="0 0 240 8"
        preserveAspectRatio="none"
        className="h-2 min-w-0 flex-1"
      >
        <path
          d="M0 4C30 3.3 55 4.8 90 4S150 3.2 190 4.3 225 3.8 240 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="shrink-0 text-sm type-num">Сейчас {formatTimeMsk(now)}</span>
    </li>
  );
}
