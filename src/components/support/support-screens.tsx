"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CircleCheck, Clock, MessageSquare, Plus, Send } from "lucide-react";
import { ApiView } from "@/components/screens/api-view";
import { useStudent } from "@/components/shell/student-context";
import { Button } from "@/components/ui/button";
import { Card, CardLink } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/error-state";
import { LoadingRegion, SkeletonCard } from "@/components/ui/skeleton";
import { Badge, type BadgeTone } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import type {
  TicketCreateBody,
  TicketDTO,
  TicketDetailDTO,
  TicketStatus,
  TicketTopic,
  TicketsDTO,
} from "@/contracts/api";
import { formatDayMonth, formatTimeMsk } from "@/lib/format";
import { sendJson } from "@/lib/send-json";
import { useApi } from "@/lib/use-api";

// Связь с деканатом (SPEC §6.8.1): обращения «Отправлено → Отвечено → Закрыто», переписка,
// норматив ответа на виду. В словаре интерфейса «обращение» — только вопрос в деканат (§7.6).

const TOPICS: { id: TicketTopic; label: string }[] = [
  { id: "schedule", label: "Расписание" },
  { id: "grades", label: "Оценки" },
  { id: "requests", label: "Справки и заявки" },
  { id: "dorm", label: "Общежитие" },
  { id: "scholarship", label: "Стипендия" },
  { id: "other", label: "Другое" },
];
const topicLabel = (t: TicketTopic) => TOPICS.find((x) => x.id === t)?.label ?? t;

const STATUS: Record<TicketStatus, { label: string; tone: BadgeTone; icon: typeof Clock }> = {
  open: { label: "Отправлено", tone: "info", icon: Send },
  answered: { label: "Отвечено", tone: "ok", icon: CircleCheck },
  closed: { label: "Закрыто", tone: "neutral", icon: Clock },
};

const SLA = "Обычно отвечаем в течение рабочего дня.";

export function SupportScreen() {
  const { userId } = useStudent();
  const api = useApi<TicketsDTO>("/api/me/tickets", { scope: userId, refreshMs: 60_000 });
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="type-h1">Связь с деканатом</h1>
        <Button asChild>
          <Link href="/support/new">
            <Plus aria-hidden />
            Написать в деканат
          </Link>
        </Button>
      </header>
      <p className="type-body text-ink-2">
        {SLA} Ответ придёт в уведомлении. Ответы на частые вопросы собраны в{" "}
        <Link href="/help">справочнике студента</Link>.
      </p>
      <ApiView
        api={api}
        skeleton={
          <LoadingRegion label="Загружаем обращения…">
            <SkeletonCard />
            <SkeletonCard />
          </LoadingRegion>
        }
      >
        {({ items }) =>
          items.length === 0 ? (
            <EmptyState
              illustration="no-requests"
              title="Обращений пока нет"
              action={
                <Button asChild>
                  <Link href="/support/new">Написать в деканат</Link>
                </Button>
              }
            >
              Если нужного нет в справочнике, спросите деканат: ответ придёт сюда.
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
              {items.map((t: TicketDTO) => {
                const s = STATUS[t.status];
                return (
                  <li key={t.id}>
                    <Card variant="interactive" className="gap-2" data-testid="ticket-row">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="min-w-0 type-h3">
                          <CardLink href={`/support/${t.id}`}>
                            {topicLabel(t.topic)}
                            {t.unread && <span className="sr-only">, есть новый ответ</span>}
                          </CardLink>
                        </h2>
                        {t.unread && (
                          <span className="mt-0.5 flex shrink-0 items-center gap-1.5 type-caption text-accent">
                            <span aria-hidden className="size-2.5 rounded-full bg-accent" />
                            Новое
                          </span>
                        )}
                      </div>
                      <Badge tone={s.tone} icon={s.icon}>
                        {s.label}
                      </Badge>
                      <p className="type-caption text-ink-2">
                        Последнее сообщение: {formatDayMonth(t.lastMessageAt)},{" "}
                        {formatTimeMsk(t.lastMessageAt)}
                      </p>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )
        }
      </ApiView>
    </>
  );
}

/** Форма нового обращения. Параметры адреса: topic, kind и id (из карточки пары или дисциплины). */
export function NewTicketScreen({
  topic: initialTopic,
  link,
  initialBody = "",
}: {
  topic: TicketTopic;
  link: TicketCreateBody["link"] | null;
  /** Черновик текста, например вопрос из «Спросить Компас». */
  initialBody?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [topic, setTopic] = React.useState<TicketTopic>(initialTopic);
  const [body, setBody] = React.useState(initialBody);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const key = React.useRef(crypto.randomUUID());
  const ids = { topic: React.useId(), body: React.useId() };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      const payload: TicketCreateBody = { topic, body: body.trim(), ...(link ? { link } : {}) };
      const res = await sendJson("POST", "/api/me/tickets", payload, key.current);
      if (res.status === 201 || res.status === 200) {
        const t = (await res.json()) as TicketDTO;
        toast({ tone: "success", title: "Сообщение отправлено", description: SLA });
        router.push(`/support/${t.id}`);
        return;
      }
      setError(
        res.status === 429
          ? "Вы отправили много сообщений за последний час. Попробуйте снова чуть позже."
          : res.status === 422
            ? "Проверьте текст: он должен быть от 1 до 2000 символов."
            : "Не получилось отправить. Текст остался в поле: проверьте интернет и нажмите «Отправить» ещё раз.",
      );
    } catch {
      setError(
        "Не получилось отправить. Текст остался в поле: проверьте интернет и нажмите «Отправить» ещё раз.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <header className="flex flex-col gap-2">
        <Button asChild variant="link" size="sm" className="self-start">
          <Link href="/support">
            <ArrowLeft aria-hidden className="size-4" />
            Связь с деканатом
          </Link>
        </Button>
        <h1 className="type-h1">Написать в деканат</h1>
        <p className="type-body text-ink-2">{SLA}</p>
      </header>
      <form onSubmit={submit} className="flex max-w-xl flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.topic} className="font-medium">
            Тема
          </label>
          <select
            id={ids.topic}
            value={topic}
            onChange={(e) => setTopic(e.target.value as TicketTopic)}
            className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-base text-ink"
          >
            {TOPICS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        {link && (
          <p className="rounded-control bg-info-bg p-3 type-caption text-info-fg">
            К сообщению приложим ссылку на{" "}
            {link.kind === "class" ? "пару" : link.kind === "course" ? "дисциплину" : "заявку"},
            чтобы сотруднику не пришлось уточнять.
          </p>
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.body} className="font-medium">
            Ваш вопрос
          </label>
          <textarea
            id={ids.body}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            maxLength={2000}
            className="min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink"
          />
          <p className="type-caption text-ink-2">{body.length} из 2000 символов</p>
        </div>
        {error && <InlineError>{error}</InlineError>}
        <Button type="submit" loading={pending} disabled={!body.trim()} className="self-start">
          Отправить
        </Button>
      </form>
    </>
  );
}

export function TicketScreen({ id }: { id: string }) {
  const { userId } = useStudent();
  const toast = useToast();
  const api = useApi<TicketDetailDTO>(`/api/me/tickets/${id}`, {
    scope: userId,
    refreshMs: 30_000,
  });
  const [text, setText] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fieldId = React.useId();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await sendJson("POST", `/api/me/tickets/${id}/messages`, { body });
      if (!res.ok) throw new Error(String(res.status));
      setText("");
      toast({ tone: "success", title: "Сообщение отправлено" });
      api.reload();
    } catch {
      setError(
        "Не получилось отправить. Текст остался в поле: проверьте интернет и нажмите «Отправить» ещё раз.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button asChild variant="link" size="sm" className="self-start">
        <Link href="/support">
          <ArrowLeft aria-hidden className="size-4" />
          Связь с деканатом
        </Link>
      </Button>
      <ApiView
        api={api}
        skeleton={
          <LoadingRegion label="Загружаем переписку…">
            <SkeletonCard />
          </LoadingRegion>
        }
        notFound={
          <EmptyState
            illustration="nothing-found"
            title="Обращение не найдено"
            action={
              <Button asChild>
                <Link href="/support">К обращениям</Link>
              </Button>
            }
          >
            Возможно, ссылка устарела или обращение принадлежит другому аккаунту.
          </EmptyState>
        }
      >
        {(t) => {
          const s = STATUS[t.status];
          return (
            <>
              <header className="flex flex-col gap-2">
                <h1 className="type-h1">{topicLabel(t.topic)}</h1>
                <Badge tone={s.tone} icon={s.icon}>
                  {s.label}
                </Badge>
              </header>
              <section aria-labelledby="thread" className="flex flex-col gap-3">
                <h2 id="thread" className="type-h2">
                  Переписка
                </h2>
                <ul className="flex flex-col gap-2">
                  {t.messages.map((m) => (
                    <li
                      key={m.id}
                      data-testid="message"
                      className={
                        m.author === "student"
                          ? "self-end rounded-card bg-surface-2 p-3"
                          : "rounded-card border border-line bg-surface p-3"
                      }
                    >
                      <p className="type-caption text-ink-2">
                        {m.author === "student" ? "Вы" : m.authorName} ·{" "}
                        {formatDayMonth(m.createdAt)}, {formatTimeMsk(m.createdAt)}
                      </p>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                    </li>
                  ))}
                </ul>
              </section>
              {t.status === "closed" ? (
                <p className="type-body text-ink-2">
                  Обращение закрыто. Если вопрос остался,{" "}
                  <Link href={`/support/new?topic=${t.topic}`}>напишите новое</Link>.
                </p>
              ) : (
                <form onSubmit={send} className="flex flex-col gap-2">
                  <label htmlFor={fieldId} className="font-medium">
                    Ваш ответ
                  </label>
                  <textarea
                    id={fieldId}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    className="min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink"
                  />
                  {error && <InlineError>{error}</InlineError>}
                  <Button
                    type="submit"
                    loading={pending}
                    disabled={!text.trim()}
                    className="self-start"
                  >
                    <MessageSquare aria-hidden />
                    Отправить
                  </Button>
                </form>
              )}
            </>
          );
        }}
      </ApiView>
    </>
  );
}
