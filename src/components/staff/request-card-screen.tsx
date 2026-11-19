"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CircleCheck,
  FileCheck,
  HandHelping,
  MessageCircleQuestion,
  PackageCheck,
  Send,
  XCircle,
} from "lucide-react";
import { ApiView } from "@/components/screens/api-view";
import { useStaff } from "@/components/shell/staff-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, SelectInput, TextArea } from "@/components/ui/field";
import { LoadingRegion, SkeletonCard } from "@/components/ui/skeleton";
import { Sheet } from "@/components/ui/sheet";
import { REQUEST_STATUS, StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import type { RejectReason, StaffRequestDTO, StaffTransitionBody } from "@/contracts/api";
import { DELIVERY_TEXT } from "@/lib/request-copy";
import { canTransition } from "@/lib/request-fsm";
import { formatDayMonth, formatTimeMsk } from "@/lib/format";
import { sendJson } from "@/lib/send-json";
import { NEED_INFO_TEMPLATES, REJECT_REASONS, REPLY_TEMPLATES } from "@/lib/staff-templates";
import { useApi } from "@/lib/use-api";
import { SlaBadge } from "./sla";
import { Clarification, requestConversation } from "@/components/requests/request-conversation";
import { TemplatePicker } from "./template-picker";

// Карточка заявки сотрудника (SPEC §6.9 п.2): данные студента (только нужные для справки),
// поля заявки, кнопки перехода по автомату статусов, история и переписка.
// Недопустимые действия не показываются; «Запросить уточнение» и «Отклонить» требуют текст.

const MESSAGE_OPEN = new Set(["submitted", "in_progress", "needs_info", "ready"]);

function Dl({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      {rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-ink-2">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function NeedInfoSheet({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (comment: string) => Promise<string | null>;
}) {
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return setError("Напишите, что нужно уточнить: студент увидит этот текст");
    setBusy(true);
    const err = await onSubmit(text.trim());
    setBusy(false);
    if (err) setError(err);
    else {
      setText("");
      setError(null);
    }
  };
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Запросить уточнение"
      description="Студент получит срочное уведомление и ответит в карточке заявки."
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <TemplatePicker templates={NEED_INFO_TEMPLATES} onPick={setText} />
        <Field label="Что нужно уточнить" error={error ?? undefined}>
          {(p) => (
            <TextArea
              {...p}
              rows={4}
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" loading={busy}>
          <MessageCircleQuestion aria-hidden />
          Отправить вопрос
        </Button>
      </form>
    </Sheet>
  );
}

function RejectSheet({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (reason: RejectReason, comment: string) => Promise<string | null>;
}) {
  const [reason, setReason] = React.useState<RejectReason | "">("");
  const [text, setText] = React.useState("");
  const [errors, setErrors] = React.useState<{ reason?: string; comment?: string; form?: string }>(
    {},
  );
  const [busy, setBusy] = React.useState(false);
  const pick = (value: string) => {
    const r = REJECT_REASONS.find((x) => x.value === value);
    setReason((r?.value ?? "") as RejectReason | "");
    if (r && r.template) setText(r.template);
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!reason) next.reason = "Выберите причину отказа";
    if (!text.trim()) next.comment = "Объясните студенту, почему отказываете и что делать дальше";
    setErrors(next);
    if (next.reason || next.comment || !reason) return;
    setBusy(true);
    const err = await onSubmit(reason, text.trim());
    setBusy(false);
    if (err) setErrors({ form: err });
  };
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Отклонить заявку"
      description="Причина и пояснение обязательны: студент увидит их в карточке."
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <Field label="Причина" error={errors.reason}>
          {(p) => (
            <SelectInput {...p} value={reason} onChange={(e) => pick(e.target.value)}>
              <option value="">Выберите</option>
              {REJECT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Пояснение студенту" error={errors.comment}>
          {(p) => (
            <TextArea
              {...p}
              rows={4}
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </Field>
        {errors.form && (
          <p role="alert" className="type-caption text-coral-fg">
            {errors.form}
          </p>
        )}
        <Button type="submit" variant="danger" loading={busy}>
          <XCircle aria-hidden />
          Отклонить заявку
        </Button>
      </form>
    </Sheet>
  );
}

function Screen({ r, reload }: { r: StaffRequestDTO; reload: () => void }) {
  const toast = useToast();
  const [now] = React.useState(() => Date.now());
  const [busy, setBusy] = React.useState<string | null>(null);
  const [sheet, setSheet] = React.useState<"need_info" | "reject" | null>(null);
  const [reply, setReply] = React.useState("");
  const [replyError, setReplyError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const { messages, current } = requestConversation(r);

  const transition = async (body: StaffTransitionBody, done: string): Promise<string | null> => {
    const res = await sendJson("POST", `/api/staff/requests/${r.id}/transition`, body);
    if (res.ok) {
      toast({ tone: "success", title: done });
      setSheet(null);
      reload();
      return null;
    }
    if (res.status === 409) {
      reload();
      return "Статус заявки уже изменился. Мы обновили карточку: проверьте и повторите действие.";
    }
    return "Не получилось сохранить. Проверьте сеть и повторите.";
  };

  const quick = async (key: string, body: StaffTransitionBody, done: string) => {
    setBusy(key);
    const err = await transition(body, done);
    setBusy(null);
    if (err) toast({ tone: "error", title: err });
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return setReplyError("Напишите сообщение студенту");
    setSending(true);
    const res = await sendJson("POST", `/api/staff/requests/${r.id}/messages`, {
      body: reply.trim(),
    });
    setSending(false);
    if (res.ok) {
      setReply("");
      setReplyError(null);
      toast({ tone: "success", title: "Сообщение отправлено" });
      reload();
    } else setReplyError("Не получилось отправить. Повторите через минуту.");
  };

  const can = (a: StaffTransitionBody["action"]) => canTransition(r.status, a, "staff");
  const noActions = !(
    can("take") ||
    can("need_info") ||
    can("ready") ||
    can("issue") ||
    can("reject")
  );

  return (
    <>
      <header className="flex flex-col gap-2">
        <Button asChild variant="link" size="sm" className="self-start">
          <Link href="/staff/queue">
            <ArrowLeft aria-hidden className="size-4" />К очереди
          </Link>
        </Button>
        <h1 className="type-h1">{r.type.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="type-caption text-ink-2">{r.number}</span>
          <StatusBadge kind="request" status={r.status} />
          <SlaBadge dueAt={r.dueAt} status={r.status} overdue={r.overdue} now={now} />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4 lg:order-1">
          <Card>
            <h2 className="type-h2">Студент</h2>
            <Dl
              rows={[
                ["ФИО", r.student.fullName],
                ["Группа", r.student.group],
                ["Направление", r.student.program],
                ["Курс", String(r.student.course)],
              ]}
            />
            <p className="type-caption text-ink-2">
              Оценки и контакты студента сотрудникам не показываются.
            </p>
          </Card>

          <Card>
            <h2 className="type-h2">Заявка</h2>
            <Dl
              rows={[
                ["Подана", `${formatDayMonth(r.createdAt)}, ${formatTimeMsk(r.createdAt)}`],
                ["Срок", formatDayMonth(r.dueAt)],
                ["Ведёт", r.assignee ?? "Пока никто"],
                [
                  "Получение",
                  r.delivery ? DELIVERY_TEXT[r.delivery] : "Заявление, документ не выдаётся",
                ],
                ["Экземпляров", String(r.copies)],
                ...Object.entries(r.fields).map(([k, v]): [string, React.ReactNode] => [
                  r.fieldLabels[k] ??
                    (k === "destination" ? "Куда предоставляется" : "Дополнительно"),
                  <span key={k} className="whitespace-pre-wrap">
                    {String(v)}
                  </span>,
                ]),
              ]}
            />
          </Card>

          <section aria-labelledby="history-title" className="flex flex-col gap-2">
            <h2 id="history-title" className="type-h2">
              История
            </h2>
            <ol className="flex flex-col gap-2" data-testid="history">
              {r.events.map((e) => (
                <li key={e.id} className="rounded-control border border-line bg-surface px-3 py-2">
                  <p className="font-medium">
                    {REQUEST_STATUS[e.toStatus].label}
                    <span className="font-normal text-ink-2">
                      {" "}
                      ·{" "}
                      {e.actor === "staff"
                        ? (e.actorName ?? "Сотрудник")
                        : e.actor === "student"
                          ? "Студент"
                          : "Система"}
                    </span>
                  </p>
                  {e.comment && <p className="whitespace-pre-wrap">{e.comment}</p>}
                  <p className="type-caption text-ink-2">
                    {formatDayMonth(e.createdAt)}, {formatTimeMsk(e.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="chat-title" className="flex flex-col gap-3">
            <h2 id="chat-title" className="type-h2">
              Переписка
            </h2>
            {messages.length === 0 ? (
              !current && <p className="text-ink-2">Сообщений пока нет.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    data-testid="message"
                    className="rounded-control border border-line bg-surface px-3 py-2"
                  >
                    <p className="type-caption text-ink-2">
                      {m.author === "student" ? "Студент" : m.authorName} ·{" "}
                      {formatDayMonth(m.createdAt)}, {formatTimeMsk(m.createdAt)}
                    </p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </li>
                ))}
              </ul>
            )}
            {current && <Clarification question={current} />}
            {MESSAGE_OPEN.has(r.status) ? (
              <form onSubmit={send} noValidate className="flex flex-col gap-3">
                <TemplatePicker templates={REPLY_TEMPLATES} onPick={setReply} />
                <Field label="Сообщение студенту" error={replyError ?? undefined}>
                  {(p) => (
                    <TextArea
                      {...p}
                      rows={3}
                      maxLength={2000}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                    />
                  )}
                </Field>
                <Button type="submit" variant="secondary" loading={sending} className="self-start">
                  <Send aria-hidden />
                  Отправить сообщение
                </Button>
              </form>
            ) : (
              <p className="text-ink-2">Заявка закрыта, переписка недоступна.</p>
            )}
          </section>
        </div>

        <Card className="gap-3 lg:sticky lg:top-24 lg:order-2" data-testid="actions">
          <h2 className="type-h2">Действия</h2>
          {noActions && <p className="text-ink-2">Для этого статуса действий нет.</p>}
          {can("take") && (
            <Button
              loading={busy === "take"}
              onClick={() => void quick("take", { action: "take" }, "Заявка в работе")}
            >
              <HandHelping aria-hidden />
              Взять в работу
            </Button>
          )}
          {can("ready") && (
            <>
              <Button
                loading={busy === "ready"}
                onClick={() =>
                  void quick(
                    "ready",
                    { action: "ready" },
                    "Заявка готова, студент получил уведомление",
                  )
                }
              >
                <FileCheck aria-hidden />
                Готово
              </Button>
              <p className="type-caption text-ink-2">
                {r.delivery === "electronic"
                  ? "Для электронной справки PDF с QR создастся сам, студент сразу сможет его скачать."
                  : "Студент получит уведомление, что оригинал можно забрать."}
              </p>
            </>
          )}
          {can("issue") && (
            <Button
              loading={busy === "issue"}
              onClick={() => void quick("issue", { action: "issue" }, "Заявка выдана и закрыта")}
            >
              <PackageCheck aria-hidden />
              Выдана
            </Button>
          )}
          {can("need_info") && (
            <Button variant="secondary" onClick={() => setSheet("need_info")}>
              <MessageCircleQuestion aria-hidden />
              Запросить уточнение
            </Button>
          )}
          {can("reject") && (
            <Button variant="danger" onClick={() => setSheet("reject")}>
              <XCircle aria-hidden />
              Отклонить
            </Button>
          )}
          {r.status === "ready" || r.status === "issued" ? (
            <p className="inline-flex items-center gap-2 type-caption text-ok-fg">
              <CircleCheck aria-hidden className="size-4" />
              Студент уведомлён
            </p>
          ) : null}
        </Card>
      </div>

      <NeedInfoSheet
        open={sheet === "need_info"}
        onOpenChange={(v) => setSheet(v ? "need_info" : null)}
        onSubmit={(comment) =>
          transition({ action: "need_info", comment }, "Вопрос отправлен студенту")
        }
      />
      <RejectSheet
        open={sheet === "reject"}
        onOpenChange={(v) => setSheet(v ? "reject" : null)}
        onSubmit={(rejectReason, comment) =>
          transition({ action: "reject", rejectReason, comment }, "Заявка отклонена")
        }
      />
    </>
  );
}

export function RequestCardScreen({ id }: { id: string }) {
  const { userId } = useStaff();
  const api = useApi<StaffRequestDTO>(`/api/staff/requests/${id}`, {
    scope: userId,
    refreshMs: 30_000,
  });
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
              <Link href="/staff/queue">К очереди</Link>
            </Button>
          }
        >
          Её нет или она относится к другому подразделению.
        </EmptyState>
      }
    >
      {(r) => <Screen key={r.id} r={r} reload={api.reload} />}
    </ApiView>
  );
}
