"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { GROUP_LABEL, useSearch } from "./use-search";

// Командная палитра ⌘K / Ctrl K (SPEC §6.10 п.1). Основа — тот же нативный диалог, что у Sheet
// (ловушка фокуса, Esc, возврат фокуса). Библиотека cmdk не взята: см. D-012. Паттерн combobox:
// фокус остаётся в поле, выбранная строка указана через aria-activedescendant.

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);
  const state = useSearch(q);
  const listId = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const hits = state.status === "done" ? state.data.groups.flatMap((g) => g.hits) : [];

  React.useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0);
    else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQ("");
    }
  }, [open]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" && hits.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % hits.length);
    } else if (e.key === "ArrowUp" && hits.length) {
      e.preventDefault();
      setActive((i) => (i - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[active];
      if (hit) go(hit.href);
      else if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`);
    }
  };

  let index = -1;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Поиск" className="lg:max-w-xl">
      <div className="flex flex-col gap-3 px-4 pb-4 wrap-anywhere">
        <div className="relative flex items-center">
          <label htmlFor={`${listId}-q`} className="sr-only">
            Что найти
          </label>
          <Search aria-hidden className="pointer-events-none absolute left-3 size-5 text-ink-2" />
          <input
            ref={inputRef}
            id={`${listId}-q`}
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls={listId}
            aria-activedescendant={hits.length ? `${listId}-o${active}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Пары, справки, преподаватели, справочник"
            className="min-h-12 w-full rounded-control border border-line-strong bg-surface pr-3 pl-10 text-base text-ink placeholder:text-ink-2"
          />
        </div>
        <div aria-live="polite" className="type-caption text-ink-2">
          {state.status === "idle" && "Введите хотя бы два символа."}
          {state.status === "loading" && "Ищем…"}
          {state.status === "error" &&
            (state.offline
              ? "Нет сети: поиск заработает, когда она появится."
              : "Поиск не отвечает. Попробуйте ещё раз.")}
          {state.status === "done" &&
            (hits.length === 0
              ? `Ничего не нашли по «${state.data.q}». Проверьте написание.`
              : `Найдено: ${hits.length}. Стрелки выбирают, Enter открывает.`)}
        </div>
        <div
          id={listId}
          role="listbox"
          aria-label="Результаты поиска"
          className="flex max-h-[50dvh] flex-col gap-2 overflow-y-auto"
        >
          {state.status === "done" &&
            state.data.groups.map((g) => (
              <div
                key={g.key}
                role="group"
                aria-labelledby={`${listId}-${g.key}`}
                className="flex flex-col gap-1"
              >
                <p id={`${listId}-${g.key}`} className="type-label text-ink-2">
                  {GROUP_LABEL[g.key]}
                </p>
                {g.hits.map((h) => {
                  index += 1;
                  const i = index;
                  return (
                    <div
                      key={h.id + h.href}
                      id={`${listId}-o${i}`}
                      role="option"
                      aria-selected={i === active}
                      onClick={() => go(h.href)}
                      onMouseMove={() => setActive(i)}
                      className={
                        "flex min-h-11 cursor-pointer flex-col justify-center rounded-control px-3 py-2 " +
                        (i === active
                          ? "bg-surface-2 outline-2 -outline-offset-2 outline-accent"
                          : "")
                      }
                    >
                      <span className="type-body-strong">{h.title}</span>
                      {h.hint && <span className="type-caption text-ink-2">{h.hint}</span>}
                    </div>
                  );
                })}
              </div>
            ))}
        </div>
        {q.trim().length >= 2 && (
          <button
            type="button"
            onClick={() => go(`/search?q=${encodeURIComponent(q.trim())}`)}
            className="min-h-11 self-start rounded-control px-2 text-accent underline"
          >
            Открыть все результаты на отдельном экране
          </button>
        )}
      </div>
    </Sheet>
  );
}
