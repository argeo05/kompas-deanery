// «Пропустить к содержимому» (WCAG 2.4.1, SPEC §5.5 п.4): первая цель Tab, видна только в фокусе.
export function SkipLink() {
  return (
    <a
      href="#content"
      className="sr-only z-50 rounded-control bg-accent px-4 py-3 font-medium text-accent-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >
      Перейти к содержимому
    </a>
  );
}
