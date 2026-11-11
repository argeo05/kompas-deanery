import Link from "next/link";

// Ссылки футера (SPEC §6.12, AC-12.1): «О проекте», «Для жюри», «Безопасность» доступны с любой страницы,
// в том числе без входа.
export function FooterLinks() {
  return (
    <nav aria-label="Страницы о проекте" className="flex flex-wrap gap-x-4">
      {[
        ["/about", "О проекте"],
        ["/jury", "Для жюри"],
        ["/security", "Безопасность"],
      ].map(([href, label]) => (
        <Link key={href} href={href} className="inline-flex min-h-11 items-center">
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Футер публичных страниц (у кабинета свой, в AppShellFrame). */
export function PublicFooter() {
  return (
    <footer className="mx-auto w-full max-w-3xl px-4 pb-8 text-xs text-ink-2">
      <FooterLinks />
    </footer>
  );
}
