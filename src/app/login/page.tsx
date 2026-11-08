import type { Metadata } from "next";
import { Logo } from "@/components/shell/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Вход — Компас" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main
      id="content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12 outline-none"
    >
      <Logo />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Вход в кабинет</h1>
        <p className="text-base text-ink-2">Введите логин и пароль, которые вам выдали.</p>
      </div>
      <LoginForm next={next} />
    </main>
  );
}
