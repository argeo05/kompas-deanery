import * as React from "react";
import { cn } from "cn";

// Поля форм (SPEC §7.4): подпись всегда видимая, ошибка и подсказка связаны через aria-describedby.
// Высота ≥ 44 px, ошибка — рамка толще и текст, не только цвет (WCAG 1.4.1).

export const CONTROL =
  "min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink aria-invalid:border-2 aria-invalid:border-coral";

/** Подпись + контрол + подсказка + ошибка. children — функция, получающая id и aria для контрола. */
export function Field({
  label,
  hint,
  error,
  optional,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  className?: string;
  children: (props: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: true;
  }) => React.ReactNode;
}) {
  const id = React.useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(" ");
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="font-medium">
        {label}
        {optional && <span className="font-normal text-ink-2"> (необязательно)</span>}
      </label>
      {hint && (
        <p id={hintId} className="type-caption text-ink-2">
          {hint}
        </p>
      )}
      {children({
        id,
        "aria-describedby": describedBy || undefined,
        "aria-invalid": error ? true : undefined,
      })}
      {error && (
        <p id={errId} className="type-caption text-coral-fg">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(CONTROL, className)} {...props} />;
}

export function TextArea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(CONTROL, "min-h-24", className)} {...props} />;
}

export function SelectInput({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(CONTROL, className)} {...props} />;
}

/** Флажок или переключатель с видимой подписью; вся строка — цель касания ≥ 44 px. */
export function CheckRow({
  type = "checkbox",
  label,
  hint,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & {
  type?: "checkbox" | "radio";
  label: string;
  hint?: string;
}) {
  return (
    <label className={cn("flex min-h-11 items-start gap-3 py-2", className)}>
      <input type={type} className="mt-0.5 size-5 shrink-0 accent-accent" {...props} />
      <span className="min-w-0">
        <span className="block">{label}</span>
        {hint && <span className="block type-caption text-ink-2">{hint}</span>}
      </span>
    </label>
  );
}
