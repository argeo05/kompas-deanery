"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { ApiView } from "@/components/screens/api-view";
import { useStudent } from "@/components/shell/student-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InlineError } from "@/components/ui/error-state";
import { LoadingRegion, SkeletonCard } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import type { SessionsDTO } from "@/contracts/api";
import { formatDayMonth, formatTimeMsk } from "@/lib/format";
import { wipeAfterRevokeAll } from "@/lib/offline/sign-out";
import { sendJson } from "@/lib/send-json";
import { useApi } from "@/lib/use-api";

// Приватность (SPEC §6.11 п.5): что хранится и зачем, активные сеансы, «Выйти на всех устройствах»,
// «Скачать мои данные».

const STORED: { title: string; text: string }[] = [
  {
    title: "Профиль",
    text: "ФИО, факультет, группа, номер студенческого билета. Нужны, чтобы показать ваше расписание и оформлять справки. Данные в демо вымышленные.",
  },
  {
    title: "Учёба",
    text: "Расписание вашей группы, оценки, допуски и дедлайны. Нужны для экранов «Сегодня» и «Учёба».",
  },
  {
    title: "Заявки и переписка",
    text: "Что вы заказали, статусы и сообщения деканату. Нужны, чтобы заявку можно было выполнить и проверить.",
  },
  {
    title: "Настройки",
    text: "Время дайджеста, тихие часы, тема и размер текста. Нужны, чтобы Компас вёл себя так, как вам удобно.",
  },
  {
    title: "Сеансы входа",
    text: "Когда и с какого устройства вы входили. Сам пароль не хранится, только его хеш; ваш IP-адрес тоже не хранится, только его отпечаток.",
  },
  {
    title: "На этом устройстве",
    text: "Копия расписания, оценок, заявок и справок для работы без интернета. При выходе стирается.",
  },
];

const SESSIONS_TITLE_ID = "sessions-title";

function SessionList({ data, reload }: { data: SessionsDTO; reload: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // Демо-аккаунтом пользуются многие эксперты, сеансов может быть десятки: сначала самые свежие.
  const [all, setAll] = React.useState(false);
  const LIMIT = 5;
  const items = all ? data.items : data.items.slice(0, LIMIT);
  // После «Завершить» строка исчезает вместе с кнопкой: фокус переводим на соседнюю кнопку
  // «Завершить», а если их больше нет — на заголовок «Где вы вошли» (WCAG 2.4.3, хвост C8).
  const listRef = React.useRef<HTMLUListElement>(null);
  const focusAfter = React.useRef<number | null>(null);
  React.useEffect(() => {
    const index = focusAfter.current;
    if (index === null) return;
    focusAfter.current = null;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("[data-end-session]");
    const next = buttons?.[Math.min(index, buttons.length - 1)];
    if (next) next.focus();
    else document.getElementById(SESSIONS_TITLE_ID)?.focus();
    // Срабатывает, когда после reload() пришёл новый список.
  }, [data]);

  async function end(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await sendJson("DELETE", `/api/me/sessions/${id}`);
      if (!res.ok && res.status !== 404) throw new Error(String(res.status));
      toast({ tone: "success", title: "Сеанс завершён" });
      focusAfter.current = items.filter((s) => !s.current).findIndex((s) => s.id === id);
      reload();
    } catch {
      setError("Не получилось завершить сеанс. Проверьте интернет и попробуйте ещё раз.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {error && <InlineError>{error}</InlineError>}
      <ul ref={listRef} className="flex flex-col divide-y divide-line">
        {items.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="type-body-strong break-words">
                {s.device}
                {s.current && (
                  <span className="type-caption font-normal text-ink-2"> · это устройство</span>
                )}
              </p>
              <p className="type-caption text-ink-2">
                Вход {formatDayMonth(s.createdAt)}, {formatTimeMsk(s.createdAt)}
              </p>
            </div>
            {!s.current && (
              <Button
                variant="secondary"
                size="sm"
                loading={busy === s.id}
                data-end-session
                onClick={() => void end(s.id)}
                aria-label={`Завершить сеанс: ${s.device}, вход ${formatDayMonth(s.createdAt)}`}
              >
                Завершить
              </Button>
            )}
          </li>
        ))}
      </ul>
      {data.items.length > LIMIT && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          aria-expanded={all}
          onClick={() => setAll(!all)}
        >
          {all ? "Показать меньше" : `Показать все сеансы (${data.items.length})`}
        </Button>
      )}
    </>
  );
}

function RevokeAll() {
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      const res = await sendJson("POST", "/api/me/sessions/revoke-all");
      if (!res.ok) throw new Error(String(res.status));
      await wipeAfterRevokeAll();
      window.location.replace("/login");
    } catch {
      setBusy(false);
      setError("Не получилось выйти. Проверьте интернет и попробуйте ещё раз.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <InlineError>{error}</InlineError>}
      {confirming ? (
        <>
          <p role="alert" className="type-caption text-coral-fg">
            Вы выйдете из Компаса на всех устройствах, включая это. Неотправленные действия
            пропадут.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button ref={confirmRef} variant="danger" loading={busy} onClick={() => void revoke()}>
              Выйти на всех устройствах
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirming(false);
                queueMicrotask(() => triggerRef.current?.focus());
              }}
            >
              Отмена
            </Button>
          </div>
        </>
      ) : (
        <Button
          ref={triggerRef}
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() => setConfirming(true)}
        >
          Выйти на всех устройствах
        </Button>
      )}
    </div>
  );
}

export function PrivacyScreen() {
  const { userId } = useStudent();
  const api = useApi<SessionsDTO>("/api/me/sessions", { scope: userId });
  return (
    <>
      <header className="flex flex-col gap-2">
        <Button asChild variant="link" size="sm" className="self-start">
          <Link href="/profile">
            <ArrowLeft aria-hidden className="size-4" />
            Профиль
          </Link>
        </Button>
        <h1 className="type-h1">Приватность</h1>
        <p className="type-body text-ink-2">
          Что Компас хранит о вас и как этим управлять. Подробнее о защите — на странице{" "}
          <Link href="/security">«Безопасность»</Link>.
        </p>
      </header>

      <Card className="gap-3 p-4">
        <h2 className="type-h3">Что хранится и зачем</h2>
        <dl className="flex flex-col gap-3">
          {STORED.map((s) => (
            <div key={s.title}>
              <dt className="type-body-strong">{s.title}</dt>
              <dd className="text-ink-2">{s.text}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="gap-3 p-4">
        <h2 id={SESSIONS_TITLE_ID} tabIndex={-1} className="type-h3">
          Где вы вошли
        </h2>
        <ApiView
          api={api}
          skeleton={
            <LoadingRegion label="Загружаем сеансы…">
              <SkeletonCard />
            </LoadingRegion>
          }
        >
          {(data) => <SessionList data={data} reload={api.reload} />}
        </ApiView>
        <RevokeAll />
      </Card>

      <Card className="gap-3 p-4">
        <h2 className="type-h3">Скачать мои данные</h2>
        <p className="type-body text-ink-2">
          Профиль, заявки, оценки, дедлайны и настройки — в одном файле (JSON). Для скачивания нужен
          интернет.
        </p>
        <Button asChild variant="secondary" size="sm" className="self-start">
          <a href="/api/me/export" download="kompas-my-data.json">
            <Download aria-hidden className="size-4" />
            Скачать данные
          </a>
        </Button>
      </Card>
    </>
  );
}
