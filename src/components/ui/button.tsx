import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";
import { LoaderCircle } from "lucide-react";

// Кнопка (SPEC §7.4): primary / secondary / ghost / danger; sm / md / lg.
// Цель касания ≥ 44 px на мобильной; sm становится компактнее только на десктопе.
const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-control text-center font-medium select-none",
    "transition-[background-color,color,border-color,opacity,transform] duration-150 ease-ink",
    "active:not-aria-disabled:scale-98 motion-reduce:active:not-aria-disabled:scale-100",
    "disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-60",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  ],
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-ink hover:not-aria-disabled:bg-accent-hover",
        secondary:
          "border border-line-strong bg-surface text-ink hover:not-aria-disabled:bg-surface-2",
        ghost: "text-ink hover:not-aria-disabled:bg-surface-2",
        danger:
          "border border-alert bg-surface text-alert hover:not-aria-disabled:bg-alert-bg hover:not-aria-disabled:text-alert-fg",
        link: "px-0 text-accent underline hover:not-aria-disabled:text-accent-hover",
      },
      size: {
        sm: "min-h-11 px-3 text-sm lg:min-h-9",
        md: "min-h-11 px-4 text-base",
        lg: "min-h-12 px-6 text-base",
        icon: "size-11",
      },
    },
    // Отдельная ссылка-кнопка держит 44 px на мобильной; внутри текста используйте обычный <a>.
    compoundVariants: [{ variant: "link", className: "lg:min-h-0" }],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Идёт действие: кнопка недоступна, рядом с текстом — индикатор. Текст не меняется, чтобы не прыгала ширина. */
    loading?: boolean;
  };

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  onClick,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      // aria-disabled вместо disabled при загрузке: кнопка остаётся в фокусе и озвучивается.
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      // submit при загрузке блокируем по-настоящему: aria-disabled не мешает повторной отправке формы.
      disabled={disabled || (loading && props.type === "submit")}
      // Без обработчика при загрузке: функцию нельзя передать из серверного компонента, а повторный клик не нужен.
      onClick={loading ? undefined : onClick}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && (
            <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />
          )}
          {children}
        </>
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
