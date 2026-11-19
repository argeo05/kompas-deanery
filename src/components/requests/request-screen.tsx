"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { DocumentDownload } from "@/components/offline/document-download";
import { ApiView } from "@/components/screens/api-view";
import { useStudent } from "@/components/shell/student-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/error-state";
import { Sheet } from "@/components/ui/sheet";
import { LoadingRegion, SkeletonCard } from "@/components/ui/skeleton";
import { OutboxBadge, StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import type { MessageDTO, RequestDetailDTO } from "@/contracts/api";
import { formatDateLong, formatDayMonth, formatTimeMsk, plural } from "@/lib/format";
import { DELIVERY_TEXT, REJECT_REASON_TEXT, statusLine } from "@/lib/request-copy";
import type { OutboxItem } from "@/lib/offline/outbox";
import { queueAction, removeQueued, useOutbox } from "@/lib/offline/use-outbox";
import { useApi } from "@/lib/use-api";
import { Tracker } from "./tracker";
import { Clarification, requestConversation } from "./request-conversation";

// Карточка заявки (SPEC §6.5 п.5–7, п.10): статус и срок, действия по статусу, трекер, переписка.

const MESSAGES_OPEN = new Set(["submitted", "in_progress", "needs_info", "ready"]);

function Messages({ request, onSent }: { request: RequestDetailDTO; onSent: () => void }) {
  const { userId } = useStudent();
  const isMine = React.useCallback(
    (i: OutboxItem) => i.kind === "request.message" && i.target === request.id,
    [request.id],
  );
  const queued = useOutbox(userId, isMine);
  const queuedCount = React.useRef(queued.length);
  // Ответ из очереди ушёл на сервер — перечитываем заявку (статус и переписку).
  React.useEffect(() => {
    if (queued.length < queuedCount.current) onSent();
    queuedCount.current = queued.length;
  }, [queued.length, onSent]);
  const [text, setText] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();
  const toast = useToast();
  const needsReply = request.status === "needs_info";
  const open = MESSAGES_OPEN.has(request.status);
  const { messages, current } = requestConversation(request);
  const questionId = `${id}-question`;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || pending) return;
    setPending(true);
    setError(null);
    const key = crypto.randomUUID();
    const url = `/api/me/requests/${request.id}/messages`;
    // Без сети ответ встаёт в очередь с тем же ключом и уйдёт сам (SPEC §6.13 п.4).
    const queue = async () => {
      await queueAction({
        id: key,
        userId,
        kind: "request.message",
        url,
        body: { body },
        label: needsReply ? "Ответ на уточнение" : "Сообщение по заявке",
        target: request.id,
      });
      setText("");
      toast({
        tone: "info",
        title: "Отправим, когда появится сеть",
        description: "Текст сохранён на телефоне.",
      });
    };
    try {
      if (!navigator.onLine) return await queue();
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json", "idempotency-key": key },
          body: JSON.stringify({ body }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        return await queue();
      }
      if (res.status !== 201) throw new Error(String(res.status));
      setText("");
      toast({ tone: "success", title: needsReply ? "Ответ отправлен" : "Сообщение отправлено" });
      onSent();
    } catch {
      setError("Не получилось отправить. Текст остался в поле — отправьте его ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="messages-title" className="flex flex-col gap-3">
      <h2 id="messages-title" tabIndex={-1} className="type-h2 outline-none">
        Переписка
      </h2>
      {messages.length === 0 ? (
        !current && queued.length === 0 && <p className="text-ink-2">Сообщений пока нет.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {messages.map((m: MessageDTO) => (
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
                {m.author === "student" ? "Вы" : m.authorName} · {formatDayMonth(m.createdAt)},{" "}
                {formatTimeMsk(m.createdAt)}
              </p>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ul>
      )}
      {queued.length > 0 && (
        <ul className="flex flex-col gap-2">
          {queued.map((m) => (
            <li
              key={m.id}
              data-testid="queued-message"
              className="flex flex-col gap-2 self-end rounded-card bg-surface-2 p-3"
            >
              <p className="type-caption text-ink-2">Вы</p>
              <p className="whitespace-pre-wrap">{(m.body as { body: string }).body}</p>
              <OutboxBadge state={m.state} />
              {m.state === "failed" && (
                <>
                  <p className="type-caption">{m.error}</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="self-start"
                    aria-label="Удалить неотправленное сообщение"
                    onClick={() => {
                      void removeQueued(m.id);
                      document.getElementById("messages-title")?.focus();
                    }}
                  >
                    Удалить
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {open && (
        <form onSubmit={send} className="flex flex-col gap-2">
          {current && <Clarification question={current} id={questionId} />}
          <label htmlFor={id} className="font-medium">
            {needsReply ? "Ваш ответ сотруднику" : "Написать сотруднику"}
          </label>
          <textarea
            id={id}
            aria-describedby={current ? questionId : undefined}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={2000}
            className="min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink"
          />
          {error && <InlineError>{error}</InlineError>}
          <Button type="submit" loading={pending} disabled={!text.trim()} className="self-start">
            {needsReply ? "Отправить ответ" : "Отправить"}
          </Button>
        </form>
      )}
    </section>
  );
}

function CancelButton({ request, onDone }: { request: RequestDetailDTO; onDone: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function cancel() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/me/requests/${request.id}/cancel`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (res.status === 409) {
        setError("Заявку уже взяли в работу, отменить её нельзя. Напишите сотруднику ниже.");
        onDone();
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setOpen(false);
      onDone();
    } catch {
      setError("Не получилось отменить. Проверьте интернет и попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Отменить заявку
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Отменить заявку?"
        description={`${request.type.title}, ${request.number}`}
      >
        <div className="flex flex-col gap-3">
          <p>Сотрудник ещё не взял её в работу. После отмены заявку можно будет подать заново.</p>
          {error && <InlineError>{error}</InlineError>}
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" loading={pending} onClick={cancel}>
              Да, отменить
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Не отменять
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}

function Actions({ request, reload }: { request: RequestDetailDTO; reload: () => void }) {
  const { status, document, pickup } = request;
  return (
    <div className="flex flex-col gap-3">
      {(status === "ready" || status === "issued") && document && (
        <DocumentDownload
          url={document.fileUrl}
          fileName={`${request.type.title}.pdf`}
          size="lg"
          className="self-start"
          testId="download-pdf"
        />
      )}
      {status === "issued" && document && (
        <Button asChild variant="secondary" className="self-start">
          <Link href="/documents">Открыть в Документах</Link>
        </Button>
      )}
      {pickup && (
        <p className="flex items-start gap-2" data-testid="pickup">
          <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-2" />
          <span>
            <strong>Где забрать:</strong> {pickup.place}, {pickup.hours}
          </span>
        </p>
      )}
      {status === "submitted" && <CancelButton request={request} onDone={reload} />}
    </div>
  );
}

function Rejection({ request }: { request: RequestDetailDTO }) {
  if (!request.rejection) return null;
  return (
    <Card className="gap-2 border-l-4 border-l-coral" data-testid="rejection">
      <h2 className="type-h3">Почему отклонили</h2>
      <p className="font-medium">{REJECT_REASON_TEXT[request.rejection.reason]}</p>
      {request.rejection.comment && (
        <p className="whitespace-pre-wrap">{request.rejection.comment}</p>
      )}
      <p className="text-ink-2">
        Исправьте данные и подайте заявку заново: форма откроется уже заполненной.
      </p>
      <Button asChild className="self-start">
        <Link href={`/requests/new/${request.type.code}?from=${request.id}`}>Подать заново</Link>
      </Button>
    </Card>
  );
}

function Details({ request, reload }: { request: RequestDetailDTO; reload: () => void }) {
  const [now] = React.useState(() => Date.now());
  const open = !["issued", "rejected", "cancelled", "ready"].includes(request.status);
  const lateDays = request.overdue
    ? Math.max(1, Math.round((now - new Date(request.dueAt).getTime()) / 86_400_000))
    : 0;
  return (
    <>
      <header className="flex flex-col gap-2">
        <Button asChild variant="link" size="sm" className="self-start">
          <Link href="/requests">
            <ArrowLeft aria-hidden className="size-4" />
            Все заявки
          </Link>
        </Button>
        <h1 className="type-h1">{request.type.title}</h1>
        <p className="type-caption text-ink-2">
          {request.number}
          {request.delivery ? ` · ${DELIVERY_TEXT[request.delivery]}` : ""}
          {request.copies > 1
            ? ` · ${request.copies} ${plural(request.copies, ["экземпляр", "экземпляра", "экземпляров"])}`
            : ""}
        </p>
        <StatusBadge
          kind="request"
          status={request.status}
          label={statusLine(request.status, request.delivery, request.assignee?.name)}
        />
        {open && (
          <p className={request.overdue ? "text-warn-fg" : "text-ink-2"}>
            {request.overdue
              ? `Срок прошёл на ${lateDays} ${plural(lateDays, ["день", "дня", "дней"])} · мы напомнили сотруднику`
              : `Ожидаемая готовность: ${formatDateLong(request.dueAt).toLowerCase()}`}
          </p>
        )}
        {request.assignee && open && (
          <p className="type-caption text-ink-2">
            Ответственный: {request.assignee.name}, {request.assignee.unit}
          </p>
        )}
      </header>
      {request.status === "needs_info" && (
        <a href="#messages-title" className="self-start">
          Перейти к уточнению и ответить
        </a>
      )}
      <Rejection request={request} />
      <Actions request={request} reload={reload} />
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
        <Tracker request={request} />
        <Messages request={request} onSent={reload} />
      </div>
    </>
  );
}

export function RequestScreen({ id }: { id: string }) {
  const { userId } = useStudent();
  const api = useApi<RequestDetailDTO>(`/api/me/requests/${id}`, {
    scope: userId,
    refreshMs: 30_000,
  });
  const seen = React.useRef<string | null>(null);

  // Открыли карточку: гасим точку «есть новое» в списке. Один запрос на заявку за визит.
  React.useEffect(() => {
    if (!api.data || seen.current === api.data.id) return;
    seen.current = api.data.id;
    void fetch(`/api/me/requests/${api.data.id}/seen`, {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => {});
  }, [api.data]);

  return (
    <ApiView
      api={api}
      skeleton={
        <LoadingRegion label="Загружаем заявку…">
          <SkeletonCard />
          <SkeletonCard />
        </LoadingRegion>
      }
      notFound={
        <EmptyState
          illustration="nothing-found"
          title="Заявка не найдена"
          action={
            <Button asChild>
              <Link href="/requests">К списку заявок</Link>
            </Button>
          }
        >
          Проверьте ссылку или откройте заявку из списка.
        </EmptyState>
      }
    >
      {(request) => <Details request={request} reload={api.reload} />}
    </ApiView>
  );
}
