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
      <ErrorState
        title="Страница не открылась"
        action={
          <>
            <Button onClick={reset}>Попробовать ещё раз</Button>
            <Button variant="secondary" asChild>
              <Link href="/">На главную</Link>
            </Button>
          </>
        }
      >
        Что-то сломалось на нашей стороне. Ваши данные в порядке — попробуйте ещё раз через минуту.
      </ErrorState>
    </main>
  );
}
