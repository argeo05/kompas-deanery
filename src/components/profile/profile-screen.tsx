"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Pencil } from "lucide-react";
import { ApiView } from "@/components/screens/api-view";
import { CalendarSubscribe } from "@/components/schedule/calendar-subscribe";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { useStudent } from "@/components/shell/student-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { InlineError } from "@/components/ui/error-state";
import { LoadingRegion, SkeletonCard } from "@/components/ui/skeleton";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { MeDTO, RequestDTO } from "@/contracts/api";
import { DATA_FIX_FIELDS, PROGRAM_LEVEL_LABEL, STUDY_FORM_LABEL } from "@/lib/profile-labels";
import { sendJson } from "@/lib/send-json";
import type { MotionPref, TextSizePref, ThemePref } from "@/lib/theme";
import { useApi } from "@/lib/use-api";
import { AppearanceSection } from "./appearance-section";
import { OfflineSection } from "./offline-section";
import { openTour } from "./onboarding";
import { Announce } from "@/components/ui/status-region";

// Профиль и настройки студента (SPEC §6.1 п.7, §6.11). Учебные данные — только чтение: их ведёт
// деканат, а ошибку в них можно сообщить заявкой «Нашли ошибку в данных?». Редактируется только
// отображаемое имя.

function Section({
  title,
  children,
  id,
}: {
  title: string;
  children: React.ReactNode;
  id?: string;
}) {
  const hid = React.useId();
  return (
    <Card className="min-w-0 gap-3 p-4 wrap-anywhere">
      <section aria-labelledby={hid} id={id} className="flex flex-col gap-3">
        <h2 id={hid} className="type-h3">
          {title}
        </h2>
        {children}
      </section>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="type-caption text-ink-2 sm:w-40 sm:shrink-0">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function NameForm({ me, onSaved }: { me: MeDTO; onSaved: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(me.displayName);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const editRef = React.useRef<HTMLButtonElement>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const name = value.trim();
    if (name.length === 0 || name.length > 40) {
      setError("Введите имя от 1 до 40 символов.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast({ tone: "success", title: "Имя сохранено" });
      setEditing(false);
      onSaved();
      queueMicrotask(() => editRef.current?.focus());
    } catch {
      setError("Не получилось сохранить. Проверьте интернет и нажмите «Сохранить» ещё раз.");
    } finally {
      setPending(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="type-caption text-ink-2">Как к вам обращаться</p>
          <p className="type-body-strong">{me.displayName}</p>
        </div>
        <Button
          ref={editRef}
          variant="secondary"
          size="sm"
          className="max-w-full whitespace-normal"
          onClick={() => {
            setValue(me.displayName);
            setEditing(true);
          }}
        >
          <Pencil aria-hidden className="size-4" />
          Изменить имя
        </Button>
      </div>
    );
  }
  return (
    <form onSubmit={save} className="flex flex-col gap-3" noValidate>
      <Field
        label="Как к вам обращаться"
        hint="Это имя вы видите в приветствии."
        error={error ?? undefined}
      >
        {(p) => (
          <TextInput
            {...p}
            value={value}
            maxLength={40}
            autoComplete="nickname"
            autoFocus
            onChange={(e) => setValue(e.target.value)}
          />
        )}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending}>
          Сохранить
        </Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
          Отмена
        </Button>
      </div>
    </form>
  );
}

function DataFixSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const toast = useToast();
  const [field, setField] = React.useState<string>("fullName");
  const [comment, setComment] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | undefined>();
  // Один ключ на попытку отправки: повтор после обрыва не создаст вторую заявку.
  const key = React.useRef(crypto.randomUUID());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (comment.trim().length === 0) {
      setFieldError("Напишите, что именно указано неверно.");
      return;
    }
    setFieldError(undefined);
    setPending(true);
    setError(null);
    try {
      const res = await sendJson(
        "POST",
        "/api/me/data-fix",
        { field, comment: comment.trim() },
        key.current,
      );
      if (res.status === 429) {
        setError("Вы отправили много заявок за час. Попробуйте снова через час.");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const created = (await res.json()) as RequestDTO;
      key.current = crypto.randomUUID();
      setComment("");
      onOpenChange(false);
      toast({
        tone: "success",
        title: "Заявка отправлена",
        description: `Номер ${created.number}. Статус смотрите в «Заявках».`,
      });
    } catch {
      setError("Не получилось отправить. Проверьте интернет и нажмите «Отправить» ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Нашли ошибку в данных?"
      description="Деканат проверит и исправит. Ответ придёт в «Заявки»."
    >
      <form onSubmit={submit} className="flex flex-col gap-4 overflow-y-auto px-4 pb-4" noValidate>
        <Field label="Что указано неверно">
          {(p) => (
            <SelectInput {...p} value={field} onChange={(e) => setField(e.target.value)}>
              {DATA_FIX_FIELDS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Как правильно" error={fieldError}>
          {(p) => (
            <TextArea
              {...p}
              value={comment}
              maxLength={1000}
              onChange={(e) => setComment(e.target.value)}
            />
          )}
        </Field>
        {error && <InlineError>{error}</InlineError>}
        <Button type="submit" loading={pending}>
          Отправить
        </Button>
      </form>
    </Sheet>
  );
}

function PasswordNote() {
  const [shown, setShown] = React.useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        size="sm"
        className="max-w-full self-start whitespace-normal"
        onClick={() => setShown(true)}
      >
        Сменить пароль
      </Button>
      {shown && (
        <p className="type-caption text-ink-2">
          <Announce message="В демо-аккаунтах смена пароля отключена, чтобы все члены жюри могли войти." />
          В демо-аккаунтах смена пароля отключена, чтобы все члены жюри могли войти.
        </p>
      )}
    </div>
  );
}

function ProfileBody({
  me,
  reload,
  prefs,
}: {
  me: MeDTO;
  reload: () => void;
  prefs: { theme: ThemePref; textSize: TextSizePref; motion: MotionPref };
}) {
  const [fixOpen, setFixOpen] = React.useState(false);
  const initials = `${me.fullName.first.charAt(0)}${me.fullName.last.charAt(0)}`.toUpperCase();
  const fullName = [me.fullName.last, me.fullName.first, me.fullName.middle]
    .filter(Boolean)
    .join(" ");
  return (
    <>
      <Section title="Вы">
        <div className="flex flex-wrap items-center gap-3">
          <span
            aria-hidden
            className="grid size-14 shrink-0 place-items-center rounded-full bg-info-bg type-h3 text-info-fg"
          >
            {initials}
          </span>
          <div className="min-w-0 flex-[1_1_9rem]">
            <p className="type-h3">{fullName}</p>
            <p className="type-caption text-ink-2">Логин: {me.login}</p>
          </div>
        </div>
        <NameForm me={me} onSaved={reload} />
        <dl className="flex flex-col gap-2 border-t border-line pt-3">
          <Row label="Факультет">{me.faculty.title}</Row>
          <Row label="Направление">
            {me.program.code} · {me.program.title} ({PROGRAM_LEVEL_LABEL[me.program.level]})
          </Row>
          <Row label="Курс">{me.course}</Row>
          <Row label="Группа">{me.group.title}</Row>
          <Row label="Форма обучения">{STUDY_FORM_LABEL[me.studyForm]}</Row>
          <Row label="Студенческий билет">{me.studentCardNo} (вымышленный номер)</Row>
        </dl>
        <p className="type-caption text-ink-2">
          Учебные данные ведёт деканат, поэтому здесь они только для чтения.
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="max-w-full self-start whitespace-normal"
          onClick={() => setFixOpen(true)}
        >
          Нашли ошибку в данных?
        </Button>
        <DataFixSheet open={fixOpen} onOpenChange={setFixOpen} />
      </Section>

      <Section title="Внешний вид">
        <AppearanceSection {...prefs} />
      </Section>

      <Section title="Без интернета">
        <OfflineSection />
      </Section>

      <Section title="Календарь и уведомления">
        <p className="type-body text-ink-2">
          Пары и дедлайны можно подписать в календарь телефона. Ссылка личная, её можно сбросить.
        </p>
        <div>
          <CalendarSubscribe />
        </div>
        <Link
          href="/notifications/settings"
          className="flex min-h-11 items-center justify-between gap-2 rounded-control text-ink no-underline"
        >
          <span className="min-w-0">Настройки уведомлений: дайджест, тихие часы</span>
          <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-2" />
        </Link>
      </Section>

      <Section title="Аккаунт и приватность">
        <PasswordNote />
        <Link
          href="/profile/privacy"
          className="flex min-h-11 items-center justify-between gap-2 rounded-control text-ink no-underline"
        >
          <span className="min-w-0">Приватность: что хранится, сеансы, скачать данные</span>
          <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-2" />
        </Link>
        <Button
          variant="secondary"
          size="sm"
          className="max-w-full self-start whitespace-normal"
          onClick={openTour}
        >
          Показать тур по Компасу
        </Button>
        <SignOutButton className="border-t border-line pt-2" />
      </Section>
    </>
  );
}

export function ProfileScreen({
  prefs,
}: {
  prefs: { theme: ThemePref; textSize: TextSizePref; motion: MotionPref };
}) {
  const { userId } = useStudent();
  const api = useApi<MeDTO>("/api/me", { scope: userId });
  return (
    <>
      <h1 className="type-h1">Профиль и настройки</h1>
      <ApiView
        api={api}
        skeleton={
          <LoadingRegion label="Загружаем профиль…">
            <SkeletonCard />
            <SkeletonCard />
          </LoadingRegion>
        }
      >
        {(me) => <ProfileBody me={me} reload={api.reload} prefs={prefs} />}
      </ApiView>
    </>
  );
}
