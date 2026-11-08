import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

// 404 (SPEC §5.4): в том числе ответ на чужой ресурс — «не найдено», без подробностей.
export default function NotFound() {
  return (
    <main
      id="content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12 outline-none"
    >
      <EmptyState
        illustration="nothing-found"
        title="Такой страницы нет"
        headingLevel="h1"
        action={
          <Button asChild>
            <Link href="/">На главную</Link>
          </Button>
        }
      >
        Возможно, ссылка устарела или в адресе опечатка.
      </EmptyState>
    </main>
  );
}
