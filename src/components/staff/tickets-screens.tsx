"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, CircleCheck, MessagesSquare, Send } from "lucide-react";
import { ApiView } from "@/components/screens/api-view";
import { useStaff } from "@/components/shell/staff-context";
import { Button } from "@/components/ui/button";
import { Card, CardLink } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, TextArea } from "@/components/ui/field";
import { LoadingRegion, SkeletonCard } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import type {
  StaffTicketDetailDTO,
  StaffTicketRowDTO,
  TicketStatus,
  TicketTopic,
} from "@/contracts/api";
import { formatDayMonth, formatTimeMsk } from "@/lib/format";
import { sendJson } from "@/lib/send-json";
import { TICKET_TEMPLATES } from "@/lib/staff-templates";
import { useApi } from "@/lib/use-api";
import { TemplatePicker } from "./template-picker";

// Обращения студентов (SPEC §6.9 п.5): список по статусам, карточка с перепиской, ответ и закрытие.

const TOPIC: Record<TicketTopic, string> = {
  schedule: "Расписание",
  grades: "Оценки",
  requests: "Справки и заявки",
  dorm: "Общежитие",
  scholarship: "Стипендия",
  other: "Другое",
};

const STATUS: Record<TicketStatus, { label: string; tone: "warn" | "ok" | "neutral" }> = {
  open: { label: "Ждёт ответа", tone: "warn" },
  answered: { label: "Отвечено", tone: "ok" },
  closed: { label: "Закрыто", tone: "neutral" },
};

const TABS: { id: TicketStatus | ""; label: string }[] = [
  { id: "open", label: "Ждут ответа" },
  { id: "answered", label: "Отвечены" },
  { id: "closed", label: "Закрыты" },
  { id: "", label: "Все" },
];

export function TicketsScreen() {
  const { userId } = useStaff();
  const [tab, setTab] = React.useState<TicketStatus | "">("open");
  const api = useApi<{ items: StaffTicketRowDTO[] }>(
    `/api/staff/tickets${tab ? `?status=${tab}` : ""}`,
    { scope: userId, refreshMs: 60_000 },
  );
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="type-h1">Обращения</h1>
        <p className="text-ink-2">
          Вопросы студентов в деканат. Обычно отвечаем в течение рабочего дня.
        </p>
      </header>
      <div role="group" aria-label="Какие обращения показать" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button
            key={t.id || "all"}
            size="sm"
            variant={tab === t.id ? "primary" : "secondary"}
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>
      <ApiView
        api={api}
        skeleton={
          <LoadingRegion label="Загружаем обращения…">
            <SkeletonCard />
            <SkeletonCard />
          </LoadingRegion>
        }
      >
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState illustration="all-done" title="Здесь пусто">
              Обращений с таким статусом нет.
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
              {data.items.map((t) => (
                <li key={t.id}>
                  <Card variant="interactive" data-testid="ticket-row">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Badge>
                    </div>
                    <h2 className="type-h3">
                      <CardLink href={`/staff/tickets/${t.id}`}>{TOPIC[t.topic]}</CardLink>
                    </h2>
                    <p className="type-caption text-ink-2">
                      {t.student.fullName}, {t.student.group} · {formatDayMonth(t.lastMessageAt)}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          )
        }
      </ApiView>
    </>
  );
}

function Detail({ t, reload }: { t: StaffTicketDetailDTO; reload: () => void }) {
  const toast = useToast();
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"send" | "close" | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return setError("Напишите ответ студенту");
    setBusy("send");
    const res = await sendJson("POST", `/api/staff/tickets/${t.id}/messages`, {
      body: text.trim(),
    });
    setBusy(null);
    if (res.ok) {
      setText("");
      setError(null);
      toast({ tone: "success", title: "Ответ отправлен" });
      reload();
    } else
      setError(
        res.status === 409 ? "Обращение уже закрыто." : "Не получилось отправить. Повторите.",
      );
  };
  const close = async () => {
    setBusy("close");
    const res = await sendJson("POST", `/api/staff/tickets/${t.id}/close`);
    setBusy(null);
    if (res.ok || res.status === 409) {
      toast({ tone: "success", title: "Обращение закрыто" });
      reload();
    } else toast({ tone: "error", title: "Не получилось закрыть. Повторите." });
  };

  return (
    <>
      <header className="flex flex-col gap-2">
        <Button asChild variant="link" size="sm" className="self-start">
          <Link href="/staff/tickets">
            <ArrowLeft aria-hidden className="size-4" />К обращениям
          </Link>
        </Button>
        <h1 className="type-h1">{TOPIC[t.topic]}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Badge>
          <span className="type-caption wrap-anywhere text-ink-2">
            {t.student.fullName}, {t.student.group}
          </span>
        </div>
      </header>
      <ul className="flex flex-col gap-2">
        {t.messages.map((m) => (
          <li
            key={m.id}
            data-testid="message"
            className="rounded-control border border-line bg-surface px-3 py-2"
          >
            <p className="type-caption text-ink-2">
              {m.author === "student" ? "Студент" : m.authorName} · {formatDayMonth(m.createdAt)},{" "}
              {formatTimeMsk(m.createdAt)}
            </p>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ul>
      {t.status === "closed" ? (
        <p className="text-ink-2">Обращение закрыто, отвечать нельзя.</p>
      ) : (
        <form onSubmit={send} noValidate className="flex flex-col gap-3">
          <TemplatePicker templates={TICKET_TEMPLATES} onPick={setText} />
          <Field label="Ответ студенту" error={error ?? undefined}>
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
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy === "send"}>
              <Send aria-hidden />
              Ответить
            </Button>
            <Button
              type="button"
              variant="secondary"
              loading={busy === "close"}
              onClick={() => void close()}
            >
              <CircleCheck aria-hidden />
              Закрыть обращение
            </Button>
          </div>
        </form>
      )}
    </>
  );
}

export function TicketScreen({ id }: { id: string }) {
  const { userId } = useStaff();
  const api = useApi<StaffTicketDetailDTO>(`/api/staff/tickets/${id}`, {
    scope: userId,
    refreshMs: 30_000,
  });
  return (
    <ApiView
      api={api}
      skeleton={
        <LoadingRegion label="Загружаем обращение…">
          <SkeletonCard />
        </LoadingRegion>
      }
      notFound={
        <EmptyState
          illustration="nothing-found"
          title="Обращение не найдено"
          action={
            <Button asChild>
              <Link href="/staff/tickets">
                <MessagesSquare aria-hidden />К обращениям
              </Link>
            </Button>
          }
        >
          Его нет или оно относится к другому подразделению.
        </EmptyState>
      }
    >
      {(t) => <Detail key={t.id} t={t} reload={api.reload} />}
    </ApiView>
  );
}
