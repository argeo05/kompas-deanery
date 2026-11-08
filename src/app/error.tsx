"use client";

import Link from "next/link";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";

// Ошибка рендеринга любой страницы (SPEC §7.6): что случилось и что сделать — по-русски, с действием.
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      id="content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12 outline-none"
    >
      <title>Страница не открылась — Компас</title>
      <ErrorState
        title="Страница не открылась"
        headingLevel="h1"
        action={
          <>
            <Button onClick={reset}>Повторить</Button>
            <Button variant="secondary" asChild>
              <Link href="/">На главную</Link>
            </Button>
          </>
        }
      >
        Не получилось открыть страницу: ошибка на нашей стороне. Попробуйте ещё раз через минуту или
        вернитесь на главную.
      </ErrorState>
    </main>
  );
}
