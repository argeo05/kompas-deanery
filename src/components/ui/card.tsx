import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import Link from "next/link";

// Карточка (SPEC §7.4): default / interactive / highlight (изменение).
// interactive — вся карточка кликабельна: внутрь кладут одну ссылку с классом card-link,
// её псевдоэлемент растягивается на карточку (ссылка остаётся одной целью для фокуса и чтения).
// Другим кнопкам внутри interactive-карточки нужен `relative z-10`, иначе их перекроет псевдоэлемент.
// highlight всегда сопровождайте текстовой меткой (Badge «Перенос»): полоса — только цвет (1.4.1).
const cardVariants = cva(
  "relative flex flex-col gap-3 rounded-card border border-(--card-border) bg-surface p-4 text-ink shadow-card",
  {
    variants: {
      variant: {
        default: "",
        interactive: [
          "transition-[background-color,transform] duration-150 ease-ink",
          "has-[.card-link:focus-visible]:outline-2 has-[.card-link:focus-visible]:outline-offset-2 has-[.card-link:focus-visible]:outline-focus",
          "active:scale-99 motion-reduce:active:scale-100 lg:hover:bg-surface-2/60",
        ],
        // Изменение (перенос, новая аудитория): полоса --warn слева и мягкое появление.
        highlight: "animate-ink-in border-l-4 border-l-warn",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Card({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return <div data-slot="card" className={cn(cardVariants({ variant }), className)} {...props} />;
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-header" className={cn("flex flex-col gap-1", className)} {...props} />
  );
}

function CardTitle({
  className,
  as: Tag = "h3",
  ...props
}: React.ComponentProps<"h3"> & { as?: "h2" | "h3" | "h4" }) {
  return <Tag data-slot="card-title" className={cn("type-h3", className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("type-caption text-ink-2", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("flex flex-col gap-2", className)} {...props} />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex flex-wrap gap-2 pt-1", className)}
      {...props}
    />
  );
}

/** Ссылка, которая делает всю interactive-карточку кликабельной. */
function CardLink({ className, ...props }: React.ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "card-link text-ink no-underline outline-none after:absolute after:inset-0 after:rounded-card",
        className,
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardLink,
  cardVariants,
};
