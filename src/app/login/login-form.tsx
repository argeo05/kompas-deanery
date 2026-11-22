"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/error-state";

// Форма входа (SPEC §6.1, минимум для кабинета): логин и пароль → Better Auth /sign-in/username.
// Сообщение об ошибке одинаково для неверного логина и пароля (AC-1.2): по нему нельзя перебирать логины.

export interface QuickAccount {
  key: string;
  name: string;
  /** Подпись на кнопке: кто это. */
  caption: string;
  login: string;
  password: string;
}

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

export function LoginForm({ next, accounts }: { next?: string; accounts: QuickAccount[] }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const loginRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void signIn(loginRef.current?.value ?? "", passwordRef.current?.value ?? "");
  }

  // Тот же вход, что и по кнопке «Войти»: отдельного входа в обход пароля нет (SPEC §6.1 п.2).
  async function signIn(username: string, password: string) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/sign-in/username", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.status === 429) {
        setError("Слишком много попыток входа. Подождите минуту и попробуйте снова.");
      } else if (!res.ok) {
        setError(
          res.status >= 500
            ? "Сервис временно не отвечает. Попробуйте через минуту."
            : "Логин или пароль не подходят. Проверьте раскладку и Caps Lock и попробуйте ещё раз.",
        );
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
      <section
        aria-labelledby="demo-quick"
        className="flex flex-col gap-3 border-t border-line pt-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4">
          <h2 id="demo-quick" className="type-h3">
            Демо-вход
          </h2>
          <Link
            href="/jury"
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            Для жюри
          </Link>
        </div>
        <p className="type-caption text-ink-2">
          Выберите вымышленный аккаунт, чтобы посмотреть, как работает Компас.
        </p>
        <ul className="flex flex-col gap-2">
          {accounts.map((a) => (
            <li key={a.key}>
              <Button
                type="button"
                variant="secondary"
                className="h-auto w-full flex-wrap justify-between gap-x-3 py-2 whitespace-normal"
                disabled={pending}
                onClick={() => {
                  if (loginRef.current) loginRef.current.value = a.login;
                  if (passwordRef.current) passwordRef.current.value = a.password;
                  void signIn(a.login, a.password);
                }}
              >
                <span>Войти как {a.name}</span>
                <span className="type-caption font-normal text-ink-2">{a.caption}</span>
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </form>
  );
}
