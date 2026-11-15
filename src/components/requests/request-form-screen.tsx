"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CircleCheck } from "lucide-react";
import { ApiView } from "@/components/screens/api-view";
import { useStudent } from "@/components/shell/student-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OutboxBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/error-state";
import { LoadingRegion, SkeletonCard } from "@/components/ui/skeleton";
import type {
  ApiErrorBody,
  Delivery,
  FormFieldSchema,
  MeDTO,
  RequestCreateBody,
  RequestDetailDTO,
  RequestDTO,
  Paged,
  RequestTypeDTO,
  RequestTypesDTO,
} from "@/contracts/api";
import { formatDateLong } from "@/lib/format";
import { DELIVERY_TEXT, DESTINATION_CHIPS, REJECT_REASON_TEXT } from "@/lib/request-copy";
import {
  clearDraft,
  fromFields,
  loadDraft,
  saveDraft,
  toFields,
  validateForm,
  type FormValues,
} from "@/lib/request-form";
import { queueAction } from "@/lib/offline/use-outbox";
import { useApi } from "@/lib/use-api";
import { cn } from "cn";
import { Announce } from "@/components/ui/status-region";

// Форма заявки (SPEC §6.5 п.2–3): поля по formSchema типа, блок «Данные из профиля», способ получения,
// экземпляры, примечание о верности данных. Черновик живёт в localStorage; при отправке уходит Idempotency-Key,
// который сохраняется до успеха: повтор при плохой связи не создаст вторую заявку (AC-5.4).
// Режим from=<id> — «Подать заново» после отказа: поля исходной заявки, способ и число экземпляров прежние.
// Без сети (или запрос не дошёл) заявка встаёт в офлайн-очередь с тем же ключом и уйдёт сама, когда
// появится связь (SPEC §6.5 «Офлайн», §6.13 п.4, AC-13.3).

/** Сколько ждать ответа на отправку: при «белых списках» запрос может висеть минутами. */
const SUBMIT_TIMEOUT_MS = 15_000;

const INPUT =
  "min-h-11 w-full rounded-control border bg-surface px-3 py-2 text-base text-ink aria-invalid:border-2 aria-invalid:border-coral";

function ProfileBlock({ me }: { me: MeDTO }) {
  const fullName = [me.fullName.last, me.fullName.first, me.fullName.middle]
    .filter(Boolean)
    .join(" ");
  return (
    <details className="rounded-control border border-line bg-surface-2 px-4 py-3">
      <summary className="min-h-11 cursor-pointer py-2 font-medium">Данные из профиля</summary>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-ink-2">ФИО</dt>
        <dd>{fullName}</dd>
        <dt className="text-ink-2">Группа</dt>
        <dd>{me.group.title}</dd>
        <dt className="text-ink-2">Направление</dt>
        <dd>{me.program.title}</dd>
        <dt className="text-ink-2">Курс</dt>
        <dd>{me.course}</dd>
      </dl>
      <p className="mt-2 type-caption text-ink-2">
        Эти данные подставляются сами. Если в них ошибка, сообщите в деканат через «Связь с
        деканатом».
      </p>
    </details>
  );
}

function FieldInput({
  f,
  value,
  error,
  chips,
  onChange,
}: {
  f: FormFieldSchema;
  value: string;
  error?: string;
  /** Быстрые варианты для текстового поля. */
  chips?: string[];
  onChange: (v: string) => void;
}) {
  const id = React.useId();
  const errId = `${id}-err`;
  const common = {
    id,
    value,
    required: f.required,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errId : undefined,
    className: cn(INPUT, error ? "border-coral" : "border-line-strong"),
  } as const;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        {f.label}
        {!f.required && <span className="font-normal text-ink-2"> (необязательно)</span>}
      </label>
      {f.kind === "select" ? (
        <select {...common} onChange={(e) => onChange(e.target.value)}>
          <option value="">Выберите</option>
          {(f.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : f.kind === "textarea" ? (
        <textarea
          {...common}
          rows={4}
          maxLength={f.max}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          {...common}
          type="text"
          inputMode={f.kind === "number" ? "decimal" : undefined}
          maxLength={f.kind === "text" ? f.max : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {chips && chips.length > 0 && (
        <div role="group" aria-label="Быстрый выбор" className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <Button
              key={c}
              type="button"
              size="sm"
              variant={value === c ? "primary" : "secondary"}
              aria-pressed={value === c}
              onClick={() => onChange(c)}
            >
              {c}
            </Button>
          ))}
        </div>
      )}
      {error && (
        <p id={errId} className="type-caption text-coral-fg">
          {error}
        </p>
      )}
    </div>
  );
}

const NEXT_STEPS = [
  "Сотрудник деканата возьмёт заявку в работу. Вы увидите это в карточке заявки.",
  "Если понадобится уточнение, вопрос появится в той же карточке, и мы пришлём уведомление.",
  "Когда всё будет готово, электронный документ можно скачать, а за оригиналом прийти в студенческий офис.",
];

function Success({ created, type }: { created: RequestDTO; type: RequestTypeDTO }) {
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => headingRef.current?.focus(), []);
  return (
    <Card className="gap-4" data-testid="request-success">
      <p className="inline-flex items-center gap-2 text-ok-fg">
        <CircleCheck aria-hidden className="size-5" />
        <span className="type-caption font-medium">Заявка отправлена</span>
      </p>
      <h1 ref={headingRef} tabIndex={-1} className="type-h1 outline-none">
        Номер заявки {created.number}
      </h1>
      <p>
        {type.title}. Ожидаемая готовность:{" "}
        <strong>{formatDateLong(created.dueAt).toLowerCase()}</strong> с учётом рабочих дней.
      </p>
      <section aria-labelledby="next-title" className="flex flex-col gap-2">
        <h2 id="next-title" className="type-h3">
          Что дальше
        </h2>
        <ol className="list-decimal space-y-1 pl-5">
          {NEXT_STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>
      <Button asChild size="lg">
        <Link href={`/requests/${created.id}`}>Перейти к заявке</Link>
      </Button>
    </Card>
  );
}

function Queued({ type }: { type: RequestTypeDTO }) {
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => headingRef.current?.focus(), []);
  return (
    <Card className="gap-4" data-testid="request-queued">
      <h1 ref={headingRef} tabIndex={-1} className="type-h1 outline-none">
        Заявка будет отправлена, когда появится сеть
      </h1>
      <OutboxBadge state="pending" />
      <p>
        {type.title}. Мы сохранили её на телефоне и отправим сами — второй раз нажимать не нужно.
      </p>
      <p className="type-caption text-ink-2">
        На iPhone отправка сработает, когда вы откроете Компас с интернетом.
      </p>
      <Button asChild size="lg">
        <Link href="/requests">К заявкам</Link>
      </Button>
    </Card>
  );
}

function Form({
  type,
  me,
  userId,
  original,
}: {
  type: RequestTypeDTO;
  me: MeDTO | undefined;
  userId: string;
  /** Исходная отклонённая заявка (режим «Подать заново»). */
  original?: RequestDetailDTO;
}) {
  const fields = type.formSchema;
  const hasDelivery = type.delivery.length > 0;
  const [values, setValues] = React.useState<FormValues>(() =>
    original ? fromFields(fields, original.fields) : {},
  );
  const [delivery, setDelivery] = React.useState<Delivery | null>(
    // Электронная справка — самый частый выбор: она уже выбрана, менять нужно редко.
    original
      ? original.delivery
      : type.delivery.includes("electronic")
        ? "electronic"
        : (type.delivery[0] ?? null),
  );
  const [copies, setCopies] = React.useState(original ? original.copies : 1);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [created, setCreated] = React.useState<RequestDTO | null>(null);
  const [queued, setQueued] = React.useState(false);
  const [focusErrors, setFocusErrors] = React.useState(0);
  const idemKey = React.useRef<string | null>(null);
  const restored = React.useRef(false);
  const [draftRestored, setDraftRestored] = React.useState(false);
  // Уже есть такая же заявка в работе: предупреждаем, но не запрещаем (разные цели бывают).
  const active = useApi<Paged<RequestDTO>>(
    original ? null : "/api/me/requests?tab=active&limit=50",
    {
      scope: userId,
    },
  );
  const duplicate = active.data?.items.find((r) => r.type.code === type.code);

  // Черновик подставляем один раз после монтирования (localStorage есть только в браузере).
  React.useEffect(() => {
    if (original || restored.current) return;
    restored.current = true;
    const draft = loadDraft(userId, type.code);
    if (!draft) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setValues(draft.values);
    if (draft.delivery && type.delivery.includes(draft.delivery as Delivery))
      setDelivery(draft.delivery as Delivery);
    setCopies(Math.min(5, Math.max(1, draft.copies)));
    setDraftRestored(Object.values(draft.values).some((v) => v !== ""));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [original, type, userId]);

  // Фокус на первое поле с ошибкой — после перерисовки, когда aria-invalid уже стоит в DOM.
  React.useEffect(() => {
    if (focusErrors === 0) return;
    document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
  }, [focusErrors]);

  // Сохраняем черновик при каждом изменении, пока заявка не отправлена.
  React.useEffect(() => {
    if (original || created || queued || !restored.current) return;
    saveDraft(userId, type.code, { values, delivery, copies });
  }, [values, delivery, copies, original, created, queued, userId, type.code]);

  if (created) return <Success created={created} type={type} />;
  if (queued) return <Queued type={type} />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const found = validateForm(fields, values);
    if (hasDelivery && delivery === null) found.delivery = "Выберите, как получить документ";
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      setFocusErrors((n) => n + 1);
      return;
    }
    const key = (idemKey.current ??= crypto.randomUUID());
    const body = original
      ? { fields: toFields(fields, values) }
      : ({
          typeCode: type.code,
          delivery,
          copies,
          fields: toFields(fields, values),
        } satisfies RequestCreateBody);
    const url = original ? `/api/me/requests/${original.id}/resubmit` : "/api/me/requests";
    // В очередь — с тем же ключом: если запрос всё-таки дошёл, повтор вернёт ту же заявку.
    const queue = async () => {
      await queueAction({
        id: key,
        userId,
        kind: original ? "request.resubmit" : "request.create",
        url,
        body,
        label: type.title,
        target: original?.id,
      });
      clearDraft(userId, type.code);
      setQueued(true);
    };
    setPending(true);
    try {
      if (!navigator.onLine) {
        await queue();
        return;
      }
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json", "idempotency-key": key },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
        });
      } catch {
        // Запрос не дошёл или завис: заявка не теряется, уйдёт из очереди.
        await queue();
        return;
      }
      if (res.status === 201) {
        setCreated((await res.json()) as RequestDTO);
        clearDraft(userId, type.code);
        return;
      }
      if (res.status === 429) {
        setFormError("Вы отправили много заявок за последний час. Попробуйте снова через час.");
      } else if (res.status === 409) {
        setFormError("Эта заявка уже отправлена. Откройте её в списке заявок.");
      } else if (res.status === 422) {
        const err = (await res.json().catch(() => null)) as ApiErrorBody | null;
        void err;
        idemKey.current = null;
        setFormError(
          "Не получилось отправить: часть данных не подошла. Проверьте поля и нажмите «Отправить» ещё раз.",
        );
      } else {
        setFormError(
          "Не получилось отправить заявку. Ваши данные сохранены: нажмите «Отправить ещё раз».",
        );
      }
    } catch {
      setFormError(
        "Не получилось отправить заявку. Ваши данные сохранены: нажмите «Отправить ещё раз».",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5" aria-label={type.title}>
      <header className="flex flex-col gap-1">
        <Button asChild variant="link" size="sm" className="self-start">
          <Link href={original ? `/requests/${original.id}` : "/requests/new"}>
            <ArrowLeft aria-hidden className="size-4" />
            Назад
          </Link>
        </Button>
        <h1 className="type-h1">{original ? `Подать заново: ${type.title}` : type.title}</h1>
        <p className="text-ink-2">{type.hint}</p>
      </header>
      {original?.rejection && (
        <Card className="gap-1 border-l-4 border-l-coral">
          <p className="font-medium">
            Почему отклонили: {REJECT_REASON_TEXT[original.rejection.reason]}
          </p>
          {original.rejection.comment && (
            <p className="whitespace-pre-wrap">{original.rejection.comment}</p>
          )}
          <p className="text-ink-2">Исправьте данные ниже и отправьте заявку ещё раз.</p>
        </Card>
      )}
      {draftRestored && (
        <p className="type-caption text-ink-2">
          <Announce message="Мы вернули то, что вы вводили раньше." />
          Мы вернули то, что вы вводили раньше.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setValues({});
              setDraftRestored(false);
              clearDraft(userId, type.code);
            }}
          >
            Начать с чистого листа
          </button>
        </p>
      )}
      {duplicate && (
        <Card className="gap-1 border-l-4 border-l-warn" role="note">
          <p className="font-medium">Такая заявка у вас уже в работе</p>
          <p className="text-ink-2">
            {duplicate.number}, ждём к {formatDateLong(duplicate.dueAt).toLowerCase()}. Если нужна
            справка для другой цели, подавайте новую.{" "}
            <Link href={`/requests/${duplicate.id}`}>Открыть заявку {duplicate.number}</Link>
          </p>
        </Card>
      )}
      {me && <ProfileBlock me={me} />}
      {fields.map((f) => (
        <FieldInput
          key={f.name}
          f={f}
          value={values[f.name] ?? ""}
          chips={f.name === "destination" ? DESTINATION_CHIPS[type.code] : undefined}
          error={
            errors[f.name] ??
            (original && f.required && !(values[f.name] ?? "").trim()
              ? "Заполните это поле"
              : undefined)
          }
          onChange={(v) => {
            setValues((s) => ({ ...s, [f.name]: v }));
            setErrors((s) => ({ ...s, [f.name]: "" }));
          }}
        />
      ))}
      {hasDelivery && (
        <fieldset
          className="flex flex-col gap-2"
          aria-describedby={errors.delivery ? "delivery-err" : undefined}
        >
          <legend className="font-medium">Как получить</legend>
          {original ? (
            <p>{delivery ? DELIVERY_TEXT[delivery] : ""}</p>
          ) : (
            <>
              {type.delivery.map((d) => (
                <label key={d} className="flex min-h-11 items-center gap-3">
                  <input
                    type="radio"
                    name="delivery"
                    value={d}
                    checked={delivery === d}
                    onChange={() => {
                      setDelivery(d);
                      setErrors((s) => ({ ...s, delivery: "" }));
                    }}
                    className="size-5 accent-(--accent)"
                  />
                  {DELIVERY_TEXT[d]}
                </label>
              ))}
              {!type.delivery.includes("electronic") && (
                <p className="type-caption text-ink-2">
                  Для этой справки нужен бумажный оригинал: электронную версию не принимают.
                </p>
              )}
            </>
          )}
          {errors.delivery && (
            <p id="delivery-err" className="type-caption text-coral-fg">
              {errors.delivery}
            </p>
          )}
        </fieldset>
      )}
      {hasDelivery && !original && (
        <div className="flex flex-col gap-1">
          <label htmlFor="copies" className="font-medium">
            Количество экземпляров
          </label>
          <select
            id="copies"
            value={copies}
            onChange={(e) => setCopies(Number(e.target.value))}
            className={cn(INPUT, "w-32 border-line-strong")}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="type-caption text-ink-2">
        Отправляя заявку, вы подтверждаете, что данные из профиля верны.
      </p>
      {formError && <InlineError>{formError}</InlineError>}
      <Button type="submit" size="lg" loading={pending}>
        {formError && !pending ? "Отправить ещё раз" : "Отправить"}
      </Button>
    </form>
  );
}

export function RequestFormScreen({ typeCode }: { typeCode: string }) {
  const { userId } = useStudent();
  const from = useSearchParams().get("from");
  const types = useApi<RequestTypesDTO>("/api/request-types", { scope: userId });
  const profile = useApi<MeDTO>("/api/me", { scope: userId });
  const original = useApi<RequestDetailDTO>(from ? `/api/me/requests/${from}` : null, {
    scope: userId,
  });

  return (
    <ApiView
      api={types}
      skeleton={
        <LoadingRegion label="Загружаем форму…">
          <SkeletonCard />
          <SkeletonCard />
        </LoadingRegion>
      }
    >
      {({ items }) => {
        const type = items.find((t) => t.code === typeCode);
        if (!type) {
          return (
            <EmptyState
              illustration="nothing-found"
              title="Такого типа нет"
              action={
                <Button asChild>
                  <Link href="/requests/new">Открыть каталог</Link>
                </Button>
              }
            >
              Возможно, ссылка устарела. Выберите справку из каталога.
            </EmptyState>
          );
        }
        if (from) {
          if (original.data === undefined) {
            return original.error === "not_found" ? (
              <EmptyState
                illustration="nothing-found"
                title="Заявка не найдена"
                action={
                  <Button asChild>
                    <Link href="/requests">К заявкам</Link>
                  </Button>
                }
              >
                Проверьте ссылку или откройте заявку из списка.
              </EmptyState>
            ) : (
              <LoadingRegion label="Загружаем заявку…">
                <SkeletonCard />
              </LoadingRegion>
            );
          }
          if (original.data.type.code !== type.code || original.data.status !== "rejected") {
            return (
              <EmptyState
                illustration="nothing-found"
                title="Подать заново нельзя"
                action={
                  <Button asChild>
                    <Link href={`/requests/${original.data.id}`}>К заявке</Link>
                  </Button>
                }
              >
                Заново можно подать только отклонённую заявку.
              </EmptyState>
            );
          }
        }
        return (
          <Form
            type={type}
            me={profile.data}
            userId={userId}
            original={from ? original.data : undefined}
          />
        );
      }}
    </ApiView>
  );
}
