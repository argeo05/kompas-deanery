"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/error-state";

// Форма входа (SPEC §6.1, минимум для кабинета): логин и пароль → Better Auth /sign-in/username.
// Сообщение об ошибке одинаково для неверного логина и пароля (AC-1.2): по нему нельзя перебирать логины.

const DEMO = { login: "anna.demo", password: "kompas-demo-anna" };

/** Только путь внутри сайта: «//host» и «/\host» открыли бы чужой адрес. */
function safeNext(next: string | undefined): string | null {
  if (!next || /[\u0000-\u001f\\]/.test(next)) return null;
  const url = new URL(next, window.location.origin);
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === "/login" || url.pathname.startsWith("/api/")) return null;
  return url.pathname + url.search;
}

const inputClass =
  "min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const loginRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/sign-in/username", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: loginRef.current?.value ?? "",
          password: passwordRef.current?.value ?? "",
        }),
      });
      if (res.status === 429) {
        setError("Слишком много попыток входа. Подождите минуту и попробуйте снова.");
      } else if (!res.ok) {
        setError("Логин или пароль не подошли. Проверьте раскладку и попробуйте ещё раз.");
      } else {
        const body = (await res.json()) as { user?: { role?: string } };
        const fallback = body.user?.role === "staff" ? "/staff/queue" : "/today";
        router.replace(safeNext(next) ?? fallback);
        router.refresh();
        return;
      }
    } catch {
      setError("Не получилось войти: пропал интернет. Проверьте подключение и попробуйте ещё раз.");
    }
    setPending(false);
    loginRef.current?.focus();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error && <InlineError id="login-error">{error}</InlineError>}
      <label className="flex flex-col gap-1.5 type-body-strong">
        Логин
        <input
          ref={loginRef}
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1.5 type-body-strong">
        Пароль
        <input
          ref={passwordRef}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </label>
      <Button type="submit" size="lg" loading={pending}>
        Войти
      </Button>
      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <p className="type-caption text-ink-2">
          Все данные вымышленные. Для проверки можно войти под демо-аккаунтом Анны.
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            if (loginRef.current) loginRef.current.value = DEMO.login;
            if (passwordRef.current) passwordRef.current.value = DEMO.password;
            passwordRef.current?.focus();
          }}
        >
          Подставить демо-аккаунт
        </Button>
      </div>
    </form>
  );
}
