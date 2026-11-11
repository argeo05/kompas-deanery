import type { Metadata } from "next";
import Link from "next/link";
import { DEMO_ACCOUNTS } from "@db/seed/demo-credentials";
import { PublicFooter } from "@/components/shell/footer-links";
import { Logo } from "@/components/shell/logo";
import { LoginForm, type QuickAccount } from "./login-form";

export const metadata: Metadata = { title: "Вход — Компас" };

const QUICK: QuickAccount[] = [
  { key: "anna", name: "Аня", caption: "бакалавр", ...DEMO_ACCOUNTS.anna },
  { key: "maxim", name: "Максим", caption: "магистрант", ...DEMO_ACCOUNTS.maxim },
  { key: "elena", name: "Елена Сергеевна", caption: "сотрудник", ...DEMO_ACCOUNTS.elena },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <>
      <main
        id="content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12 outline-none"
      >
        <Logo />
        <div className="flex flex-col gap-2">
          <h1 className="type-h1">Вход в кабинет</h1>
          <p className="type-body text-ink-2">Введите логин и пароль, которые вам выдали.</p>
        </div>
        <LoginForm next={next} accounts={QUICK} />
        <p className="type-caption text-ink-2">
          <Link href="/security" className="inline-flex min-h-11 items-center">
            Как устроена безопасность
          </Link>
        </p>
      </main>
      <PublicFooter />
    </>
  );
}
