"use client";

import * as React from "react";
import { cn } from "cn";
import { X } from "lucide-react";

// Нижний лист (SPEC §7.4): ловушка фокуса, закрытие по Esc, по свайпу вниз, по кнопке и по фону.
// На десктопе (≥ 1024 px) — диалог по центру. Основа — нативный <dialog> в модальном режиме:
// браузер сам делает остальную страницу inert, держит фокус внутри и возвращает его на кнопку,
// которая открыла лист. Radix Dialog не взят: его блокировка прокрутки вставляет <style> без nonce (D-007).

const SWIPE_CLOSE_PX = 80;

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  const descId = React.useId();
  const drag = React.useRef<{ startY: number; dy: number } | null>(null);
  const [offset, setOffset] = React.useState(0);

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Свайп вниз за «ручку» и заголовок. Альтернатива свайпу — кнопка «Закрыть» и Esc (WCAG 2.5.7).
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return;
    drag.current = { startY: e.clientY, dy: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.startY);
    setOffset(drag.current.dy);
  };
  const onPointerUp = () => {
    const dy = drag.current?.dy ?? 0;
    drag.current = null;
    setOffset(0);
    if (dy > SWIPE_CLOSE_PX) onOpenChange(false);
  };

  return (
    <dialog
      ref={ref}
      data-modal
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={() => onOpenChange(false)}
      onCancel={(e) => {
        e.preventDefault();
        onOpenChange(false);
      }}
      // Клик по фону (сам <dialog> за пределами панели) закрывает лист.
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
      style={offset ? { transform: `translateY(${offset}px)` } : undefined}
      className={cn(
        "m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-hidden rounded-t-card bg-surface p-0 text-ink shadow-raised",
        "backdrop:bg-scrim open:animate-ink-in",
        "lg:m-auto lg:max-w-lg lg:rounded-card",
        className,
      )}
    >
      <div className="flex max-h-[85dvh] flex-col">
        <div
          className="flex touch-none flex-col gap-1 px-4 pt-2 pb-2 lg:pt-4"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span
            aria-hidden
            className="mx-auto mb-2 block h-1 w-10 rounded-full bg-line-strong lg:hidden"
          />
          <div className="flex items-start justify-between gap-2">
            <h2 id={titleId} className="pt-2 text-xl font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Закрыть"
              className="-mr-2 grid size-11 shrink-0 place-items-center rounded-control text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
          {description && (
            <p id={descId} className="text-sm text-ink-2">
              {description}
            </p>
          )}
        </div>
        <div className="overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </dialog>
  );
}
