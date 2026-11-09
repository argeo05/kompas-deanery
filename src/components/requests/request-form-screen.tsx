"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CircleCheck } from "lucide-react";
import { ApiView } from "@/components/screens/api-view";
import { useStudent } from "@/components/shell/student-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  RequestTypeDTO,
  RequestTypesDTO,
} from "@/contracts/api";
import { formatDateLong } from "@/lib/format";
import { DELIVERY_TEXT, REJECT_REASON_TEXT } from "@/lib/request-copy";
import {
  clearDraft,
  fromFields,
  loadDraft,
  saveDraft,
  toFields,
  validateForm,
  type FormValues,
} from "@/lib/request-form";
import { useApi } from "@/lib/use-api";
import { cn } from "cn";

// Форма заявки (SPEC §6.5 п.2–3): поля по formSchema типа, блок «Данные из профиля», способ получения,
// экземпляры, «Данные верны». Черновик живёт в localStorage; при отправке уходит Idempotency-Key,
// который сохраняется до успеха: повтор при плохой связи не создаст вторую заявку (AC-5.4).
// Режим from=<id> — «Подать заново» после отказа: поля исходной заявки, способ и число экземпляров прежние.

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
  onChange,
}: {
  f: FormFieldSchema;
  value: string;
  error?: string;
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
    original ? original.delivery : type.delivery.length === 1 ? type.delivery[0]! : null,
  );
  const [copies, setCopies] = React.useState(original ? original.copies : 1);
  const [confirmed, setConfirmed] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [created, setCreated] = React.useState<RequestDTO | null>(null);
  const [focusErrors, setFocusErrors] = React.useState(0);
  const idemKey = React.useRef<string | null>(null);
  const restored = React.useRef(false);
  const [draftRestored, setDraftRestored] = React.useState(false);

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
    if (original || created || !restored.current) return;
    saveDraft(userId, type.code, { values, delivery, copies });
  }, [values, delivery, copies, original, created, userId, type.code]);

  if (created) return <Success created={created} type={type} />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const found = validateForm(fields, values);
    if (hasDelivery && delivery === null) found.delivery = "Выберите, как получить документ";
    if (!confirmed) found.confirmed = "Подтвердите, что данные верны";
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      setFocusErrors((n) => n + 1);
      return;
    }
    idemKey.current ??= crypto.randomUUID();
    setPending(true);
    try {
      const body = original
        ? { fields: toFields(fields, values) }
        : ({
            typeCode: type.code,
            delivery,
            copies,
            fields: toFields(fields, values),
          } satisfies RequestCreateBody);
      const url = original ? `/api/me/requests/${original.id}/resubmit` : "/api/me/requests";
      const res = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "idempotency-key": idemKey.current },
        body: JSON.stringify(body),
      });
      if (res.status === 201) {
        setCreated((await res.json()) as RequestDTO);
        clearDraft(userId, type.code);
        return;
      }
      if (res.status === 429) {
        setFormError("Вы отправили много заявок за последний час. Попробуйте снова через час.");
      } else if (res.status === 409) {
        setFormError("Эта заявка уже подана заново. Откройте её в списке заявок.");
      } else if (res.status === 422) {
        const err = (await res.json().catch(() => null)) as ApiErrorBody | null;
        void err;
        idemKey.current = null;
        setFormError(
          "Не получилось отправить: часть данных не подошла. Проверьте поля и нажмите «Отправить» ещё раз.",
        );
      } else {
        setFormError(
          "Не получилось отправить заявку. Ваши данные сохранены: нажмите «Отправить» ещё раз.",
        );
      }
    } catch {
      setFormError(
        "Не получилось отправить: пропал интернет. Ваши данные сохранены, проверьте сеть и нажмите «Отправить» ещё раз.",
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
        <p role="status" className="type-caption text-ink-2">
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
      {me && <ProfileBlock me={me} />}
      {fields.map((f) => (
        <FieldInput
          key={f.name}
          f={f}
          value={values[f.name] ?? ""}
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
      <div className="flex flex-col gap-1">
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={confirmed}
            aria-invalid={errors.confirmed ? true : undefined}
            aria-describedby={errors.confirmed ? "confirmed-err" : undefined}
            onChange={(e) => {
              setConfirmed(e.target.checked);
              setErrors((s) => ({ ...s, confirmed: "" }));
            }}
            className="size-5 accent-(--accent)"
          />
          Данные верны
        </label>
        {errors.confirmed && (
          <p id="confirmed-err" className="type-caption text-coral-fg">
            {errors.confirmed}
          </p>
        )}
      </div>
      {formError && <InlineError>{formError}</InlineError>}
      <Button type="submit" size="lg" loading={pending}>
        {formError && !pending ? "Повторить отправку" : "Отправить"}
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
