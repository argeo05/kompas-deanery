"use client";

import * as React from "react";
import { cn } from "cn";
import { CircleAlert, CircleCheck, Info, X, type LucideIcon } from "lucide-react";

// Toast (SPEC §7.4): info / success / error. Автозакрытие через 5 с, кроме ошибок;
// пока на toast наведён указатель или фокус, таймер стоит (WCAG 2.2.1).
// Своя реализация, а не sonner: тот вставляет <style> без nonce, и CSP его блокирует (D-007).

export type ToastTone = "info" | "success" | "error";

export interface ToastInput {
  tone?: ToastTone;
  title: string;
  description?: string;
  /** Необязательное действие, например «Повторить». */
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends Required<Pick<ToastInput, "tone" | "title">> {
  id: number;
  description?: string;
  action?: ToastInput["action"];
}

const AUTO_CLOSE_MS = 5000;

const ToastContext = React.createContext<((t: ToastInput) => void) | null>(null);

export function useToast() {
  const push = React.useContext(ToastContext);
  if (!push) throw new Error("useToast вызывается внутри <ToastProvider>");
  return push;
}

const TONE: Record<ToastTone, { icon: LucideIcon; className: string }> = {
  info: { icon: Info, className: "text-info" },
  success: { icon: CircleCheck, className: "text-ok" },
  error: { icon: CircleAlert, className: "text-alert" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(1);

  const dismiss = React.useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback((t: ToastInput) => {
    const item: ToastItem = { tone: "info", ...t, id: nextId.current++ };
    // Больше трёх одновременно не держим: старые уходят.
    setItems((list) => [...list.slice(-2), item]);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      {/* Регионы существуют всегда, иначе первое сообщение читалка не озвучит. */}
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4",
          "bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+0.75rem)] lg:right-6 lg:bottom-6 lg:left-auto lg:items-end",
        )}
      >
        <div
          role="status"
          aria-live="polite"
          className="flex w-full flex-col items-center gap-2 lg:items-end"
        >
          {items
            .filter((t) => t.tone !== "error")
            .map((t) => (
              <Toast key={t.id} item={t} onClose={() => dismiss(t.id)} />
            ))}
        </div>
        <div role="alert" className="flex w-full flex-col items-center gap-2 lg:items-end">
          {items
            .filter((t) => t.tone === "error")
            .map((t) => (
              <Toast key={t.id} item={t} onClose={() => dismiss(t.id)} />
            ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const [paused, setPaused] = React.useState(false);
  const autoClose = item.tone !== "error";

  React.useEffect(() => {
    if (!autoClose || paused) return;
    const timer = window.setTimeout(onClose, AUTO_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [autoClose, paused, onClose]);

  const { icon: Icon, className } = TONE[item.tone];
  return (
    <div
      data-slot="toast"
      data-tone={item.tone}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex w-full max-w-sm animate-ink-in items-start gap-3 rounded-card border border-(--card-border) bg-surface p-3 pl-4 text-ink shadow-raised"
    >
      <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", className)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
        <p className="font-medium">{item.title}</p>
        {item.description && <p className="text-sm text-ink-2">{item.description}</p>}
        {item.action && (
          <button
            type="button"
            onClick={() => {
              item.action!.onClick();
              onClose();
            }}
            className="-mx-2 min-h-11 self-start rounded-control px-2 font-medium text-accent hover:text-accent-hover"
          >
            {item.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрыть уведомление"
        className="-m-1 grid size-11 shrink-0 place-items-center rounded-control text-ink-2 hover:bg-surface-2 hover:text-ink"
      >
        <X aria-hidden className="size-5" />
      </button>
    </div>
  );
}
