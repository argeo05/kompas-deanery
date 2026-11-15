"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ApiView } from "@/components/screens/api-view";
import { useStudent } from "@/components/shell/student-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InlineError } from "@/components/ui/error-state";
import { LoadingRegion, SkeletonCard } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import type { NotificationCategory, NotificationPrefsDTO } from "@/contracts/api";
import { sendJson } from "@/lib/send-json";
import { useApi } from "@/lib/use-api";

// Настройки уведомлений (SPEC §6.6 п.4, «Уточнение v1.1 — личный контроль»): у каждой категории три
// режима — «В дайджест», «Сразу», «Выключено»; окна дайджеста — пресеты или свои 1–4; тихие часы.
// Вместо «Выключить всё» — режим «Только срочное». «Расписание» выключить нельзя.

const CATEGORIES: { id: NotificationCategory; label: string; locked?: boolean }[] = [
  { id: "schedule", label: "Расписание: переносы и отмены", locked: true },
  { id: "request", label: "Заявки: смена статуса" },
  { id: "grade", label: "Оценки" },
  { id: "deadline", label: "Дедлайны" },
  { id: "plan", label: "Мои планы" },
  { id: "ticket", label: "Ответы деканата" },
  { id: "announcement", label: "Объявления" },
];

type Mode = "digest" | "now" | "off";

const PRESETS = {
  default: { label: "Обычный: 8:00, 13:00, 19:00", slots: [480, 780, 1140] },
  evening: { label: "Вечерний: 12:00, 17:30, 21:30", slots: [720, 1050, 1290] },
} as const;

const toTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromTime = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

function presetOf(slots: number[]): "default" | "evening" | "custom" {
  const same = (a: readonly number[]) =>
    a.length === slots.length && a.every((v, i) => v === slots[i]);
  return same(PRESETS.default.slots)
    ? "default"
    : same(PRESETS.evening.slots)
      ? "evening"
      : "custom";
}

function Form({ initial, reload }: { initial: NotificationPrefsDTO; reload: () => void }) {
  const toast = useToast();
  const [slots, setSlots] = React.useState(initial.slots);
  const [quietFrom, setQuietFrom] = React.useState(initial.quietFrom);
  const [quietTo, setQuietTo] = React.useState(initial.quietTo);
  const [immediate, setImmediate] = React.useState(new Set(initial.immediateCategories));
  const [disabled, setDisabled] = React.useState(new Set(initial.disabledCategories));
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const preset = presetOf(slots);
  const [customOpen, setCustomOpen] = React.useState(preset === "custom");

  const modeOf = (c: NotificationCategory): Mode =>
    disabled.has(c) ? "off" : immediate.has(c) ? "now" : "digest";
  const setMode = (c: NotificationCategory, m: Mode) => {
    const i = new Set(immediate);
    const d = new Set(disabled);
    i.delete(c);
    d.delete(c);
    if (m === "now") i.add(c);
    if (m === "off") d.add(c);
    setImmediate(i);
    setDisabled(d);
  };
  const onlyUrgent = () => {
    setImmediate(new Set());
    setDisabled(new Set(CATEGORIES.filter((c) => !c.locked).map((c) => c.id)));
  };
  const urgentOnly = CATEGORIES.filter((c) => !c.locked).every((c) => disabled.has(c.id));

  // Несохранённые изменения: сравниваем текущий выбор с тем, что пришло с сервера (C11, R2-02).
  const snapshot = (sl: number[], qf: number, qt: number, im: Set<string>, di: Set<string>) =>
    JSON.stringify([[...sl].sort((a, b) => a - b), qf, qt, [...im].sort(), [...di].sort()]);
  // Эталон — то, что сохранено на сервере. Фоновое обновление данных его не трогает,
  // иначе оно стирало бы правки, которые человек ещё не сохранил.
  const [base, setBase] = React.useState(initial);
  const dirty =
    snapshot(slots, quietFrom, quietTo, immediate, disabled) !==
    snapshot(
      base.slots,
      base.quietFrom,
      base.quietTo,
      new Set(base.immediateCategories),
      new Set(base.disabledCategories),
    );

  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function discard() {
    setSlots(base.slots);
    setQuietFrom(base.quietFrom);
    setQuietTo(base.quietTo);
    setImmediate(new Set(base.immediateCategories));
    setDisabled(new Set(base.disabledCategories));
    setCustomOpen(presetOf(base.slots) === "custom");
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const body = {
        slots: [...slots].sort((a, b) => a - b),
        preset,
        quietFrom,
        quietTo,
        immediateCategories: [...immediate],
        disabledCategories: [...disabled],
      };
      const res = await sendJson("PUT", "/api/me/notification-prefs", body);
      if (!res.ok) {
        setError(
          res.status === 422
            ? "Проверьте окна дайджеста: время не должно повторяться, окон от 1 до 4."
            : "Не получилось сохранить. Проверьте интернет и нажмите «Сохранить» ещё раз.",
        );
        return;
      }
      setBase({ ...initial, ...body });
      toast({ tone: "success", title: "Настройки сохранены" });
      reload();
    } catch {
      setError("Не получилось сохранить. Проверьте интернет и нажмите «Сохранить» ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      <Card className="gap-2 p-4">
        <h2 className="type-h3">Только срочное</h2>
        <p className="type-body text-ink-2">
          Придут только переносы и отмены, заявки с вопросом и «Важное» от деканата. Остальное можно
          прочитать в центре уведомлений, когда захотите. Выключать всё совсем мы не предлагаем: по
          исследованию, это повышает тревожность.{" "}
          <Link href="/about#research">Подробнее об исследовании</Link>
        </p>
        <Button
          type="button"
          variant={urgentOnly ? "primary" : "secondary"}
          aria-pressed={urgentOnly}
          className="self-start"
          onClick={onlyUrgent}
        >
          Только срочное
        </Button>
      </Card>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 type-h2">Что и когда присылать</legend>
        <p className="type-caption text-ink-2">
          По умолчанию уведомления собираются в дайджест, чтобы не отвлекать. Любую категорию можно
          переключить на «Сразу».
        </p>
        {CATEGORIES.map((c) => (
          <div key={c.id} role="group" aria-label={c.label} className="flex flex-col gap-2">
            <p className="type-body-strong">{c.label}</p>
            {c.locked ? (
              <p className="type-caption text-ink-2">
                Приходит сразу и всегда: срочные изменения нельзя пропустить.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["digest", "В дайджест"],
                    ["now", "Сразу"],
                    ["off", "Выключено"],
                  ] as const
                ).map(([m, label]) => (
                  <Button
                    key={m}
                    type="button"
                    size="sm"
                    variant={modeOf(c.id) === m ? "primary" : "secondary"}
                    aria-pressed={modeOf(c.id) === m}
                    onClick={() => setMode(c.id, m)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 type-h2">Окна дайджеста</legend>
        <p className="type-caption text-ink-2">
          Время московское. Три окна в день — хороший баланс: так уведомления реже отвлекают.
        </p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => (
            <Button
              key={k}
              type="button"
              size="sm"
              variant={preset === k ? "primary" : "secondary"}
              aria-pressed={preset === k}
              onClick={() => {
                setSlots([...PRESETS[k].slots]);
                setCustomOpen(false);
              }}
            >
              {PRESETS[k].label}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant={preset === "custom" ? "primary" : "secondary"}
            aria-pressed={preset === "custom"}
            onClick={() => setCustomOpen(true)}
          >
            Свои окна
          </Button>
        </div>
        {customOpen && (
          <div className="flex flex-col gap-2">
            {slots.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <label className="flex items-center gap-2">
                  <span className="type-body">Окно {i + 1}</span>
                  <input
                    type="time"
                    value={toTime(s)}
                    onChange={(e) =>
                      e.target.value &&
                      setSlots(slots.map((v, j) => (j === i ? fromTime(e.target.value) : v)))
                    }
                    className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-base text-ink"
                  />
                </label>
                {slots.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSlots(slots.filter((_, j) => j !== i))}
                  >
                    Убрать окно {i + 1}
                  </Button>
                )}
              </div>
            ))}
            {slots.length < 4 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => setSlots([...slots, Math.min(1380, (slots.at(-1) ?? 480) + 120)])}
              >
                Добавить окно
              </Button>
            )}
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 type-h2">Тихие часы</legend>
        <p className="type-caption text-ink-2">
          В это время ничего не приходит. Всё накопится до конца тихих часов, кроме изменений на
          первую пару следующего дня.
        </p>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2">
            <span className="type-body">С</span>
            <input
              type="time"
              value={toTime(quietFrom)}
              onChange={(e) => e.target.value && setQuietFrom(fromTime(e.target.value))}
              className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-base text-ink"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="type-body">До</span>
            <input
              type="time"
              value={toTime(quietTo)}
              onChange={(e) => e.target.value && setQuietTo(fromTime(e.target.value))}
              className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-base text-ink"
            />
          </label>
        </div>
      </fieldset>

      <div className="sticky bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] z-20 -mx-4 flex flex-col gap-2 border-t border-line bg-surface px-4 py-3 md:-mx-6 md:px-6 lg:bottom-0">
        {error && <InlineError>{error}</InlineError>}
        <p role="status" className="type-body-strong">
          {dirty
            ? "Есть несохранённые изменения. Нажмите «Сохранить», иначе они пропадут."
            : "Все изменения сохранены."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={pending} disabled={!dirty && !pending}>
            Сохранить
          </Button>
          {dirty && (
            <Button type="button" variant="secondary" onClick={discard}>
              Отменить
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

export function NotificationSettingsScreen() {
  const { userId } = useStudent();
  const api = useApi<NotificationPrefsDTO>("/api/me/notification-prefs", { scope: userId });
  return (
    <>
      <header className="flex flex-col gap-2">
        <Button asChild variant="link" size="sm" className="self-start">
          <Link href="/notifications">
            <ArrowLeft aria-hidden className="size-4" />
            Уведомления
          </Link>
        </Button>
        <h1 className="type-h1">Настройки уведомлений</h1>
      </header>
      <ApiView
        api={api}
        skeleton={
          <LoadingRegion label="Загружаем настройки…">
            <SkeletonCard />
            <SkeletonCard />
          </LoadingRegion>
        }
      >
        {(prefs) => <Form initial={prefs} reload={api.reload} />}
      </ApiView>
    </>
  );
}
