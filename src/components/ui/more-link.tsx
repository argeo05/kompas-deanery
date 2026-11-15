import Link from "next/link";
import { cn } from "cn";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Ссылка-«ещё» у заголовка блока («Все пары ›», «‹ Учёба»): видна как ссылка (цвет + шеврон +
// подчёркивание при наведении) и держит цель касания 44 px по высоте на любой ширине (SPEC §7.7).
// Внутри абзаца используйте обычный <a> — его оформляет глобальный стиль ссылок в тексте.
export function MoreLink({
  back = false,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Link> & { back?: boolean }) {
  return (
    <Link
      data-slot="more-link"
      className={cn(
        "inline-flex min-h-11 w-fit items-center gap-1 type-body text-accent no-underline hover:text-accent-hover hover:underline",
        className,
      )}
      {...props}
    >
      {back && <ChevronLeft aria-hidden className="size-4 shrink-0" />}
      {children}
      {!back && <ChevronRight aria-hidden className="size-4 shrink-0" />}
    </Link>
  );
}
