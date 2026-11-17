"use client";

import Link from "next/link";
import { cn } from "cn";
import { CalendarPlus, ChevronRight } from "lucide-react";
import { ChangeNote } from "@/components/schedule/class-card";
import {
  CLASS_TYPE_LABEL,
  classDate,
  roomText,
  sameDay,
  shortName,
  timeRange,
} from "@/components/schedule/class-meta";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Illustration } from "@/components/ui/illustrations";
import type { ClassDTO, Hero, TodayDTO } from "@/contracts/api";
import { formatDuration, formatTimeMsk, formatWeekdayLong, plural } from "@/lib/format";
import { downloadClassIcs } from "@/lib/ics-client";

// «Главное сейчас» (SPEC §6.2 п.2): одна карточка, содержимое выбирает сервер (pickHero),
// клиент только считает отсчёт по часам сервера. Обновление раз в минуту, aria-live="off".

const openHref = (c: ClassDTO) => `/schedule?d=${classDate(c.startsAt)}&class=${c.id}`;

function minutesBetween(from: Date, toIso: string): number {
  return Math.max(0, Math.ceil((Date.parse(toIso) - from.getTime()) / 60_000));
}

/** «Завтра первая пара в 9:30» / «Ближайшие занятия — понедельник, 9:30». */
function nextClassPhrase(nextClassAt: string | null, now: Date): { short: string; long: string } {
  if (!nextClassAt) {
    const none = "Ближайших занятий в расписании пока нет.";
    return { short: none, long: none };
  }
  const time = formatTimeMsk(nextClassAt);
  const dayKey = (d: Date | string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date(d));
  const diff = Math.round((Date.parse(dayKey(nextClassAt)) - Date.parse(dayKey(now))) / 86_400_000);
  const day = diff === 1 ? "завтра" : formatWeekdayLong(nextClassAt);
  return {
    short: diff === 1 ? `Завтра первая пара в ${time}` : `Ближайшие занятия — ${day}, ${time}`,
    long: `Ближайшие занятия — ${day}, ${time}`,
  };
}

function HeroActions({ cls }: { cls: ClassDTO }) {
  // Кнопки переносятся на вторую строку, а не вылезают за карточку: 320 px, крупный текст (1.4.10).
  // Узкие отступы держат обе кнопки в одной строке на 360 px (AC-2.1: две пары над сгибом).
  return (
    <CardFooter className="*:flex-auto *:gap-1.5 *:px-2.5">
      <Link href={openHref(cls)} className={buttonVariants({ size: "md" })}>
        Открыть
        <span className="sr-only">: {cls.course.title}</span>
        <ChevronRight aria-hidden />
      </Link>
      <Button
        variant="secondary"
        aria-label={`В календарь: ${cls.course.title}`}
        onClick={() => downloadClassIcs(cls)}
      >
        <CalendarPlus aria-hidden />В календарь
      </Button>
    </CardFooter>
  );
}

/** Ближайшая пара сегодня: идёт сейчас или начнётся первой; отменённые не считаются. */
function nearestClass(classes: ClassDTO[], now: Date): ClassDTO | null {
  return (
    classes
      .filter((c) => c.change?.type !== "cancelled" && Date.parse(c.endsAt) > now.getTime())
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0] ?? null
  );
}

/** Тетрадная линовка (§7.2a п.4); текст отступает от «поля» в 24 px. */
const HERO_PAPER = "paper-ruled pl-9";

/** Крупное время Unbounded (§7.2a п.3). У переноса старое время зачёркнуто caption-ом, стрелка и новое время крупно. */
function HeroTime({ cls, detail }: { cls: ClassDTO; detail?: string }) {
  const prev = cls.change?.type === "moved" ? cls.change.previous : null;
  const wasSameDay = prev && sameDay(prev.startsAt, cls.startsAt);
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      {wasSameDay && (
        <>
          <s className="type-caption text-ink-2 tabular">
            <span className="sr-only">Было </span>
            {formatTimeMsk(prev.startsAt)}
          </s>
          <span aria-hidden className="type-caption text-ink-2">
            →
          </span>
        </>
      )}
      <span className="inline-block bg-surface type-display">
        {wasSameDay && <span className="sr-only">Стало </span>}
        {formatTimeMsk(cls.startsAt)}
      </span>
      {detail && <span className="type-caption text-ink-2 tabular">{detail}</span>}
    </p>
  );
}

function ClassFacts({ cls, withRoom = true }: { cls: ClassDTO; withRoom?: boolean }) {
  return (
    <p className="type-body text-ink-2">
      {withRoom && `${roomText(cls.room)} · `}
      {shortName(cls.teacher.fullName)}
    </p>
  );
}

function HeroContent({ today, now }: { today: TodayDTO; now: Date }) {
  const hero: Hero = today.hero;
  const byId = (id: string) => today.classes.find((c) => c.id === id);

  if (hero.kind === "change") {
    const cls = byId(hero.classId);
    if (!cls) return null;
    const meta = hero.change.type;
    const lead =
      meta === "cancelled"
        ? "Пара отменена"
        : meta === "moved"
          ? "Пара перенесена"
          : meta === "room_changed"
            ? "Новая аудитория"
            : meta === "teacher_changed"
              ? "Другой преподаватель"
              : "Новая пара";
    // Крупное время — только у ближайшей пары (C11, CW-01). Если изменилась не она,
    // изменение показываем компактно, а ниже — ближайшую пару с крупным временем.
    const nearest = nearestClass(today.classes, now);
    const other = nearest && nearest.id !== cls.id ? nearest : null;
    const moreChanges = today.classes.filter(
      (c) => c.id !== cls.id && c.change && !c.change.seen,
    ).length;
    return (
      <Card
        variant="highlight"
        data-hero="change"
        role="region"
        aria-label="Главное сейчас: изменение в расписании"
        className={HERO_PAPER}
      >
        <CardHeader>
          <ChangeNote cls={cls} />
          <h2 className="type-h2 break-words hyphens-auto">
            {lead}: {cls.course.title}
          </h2>
        </CardHeader>
        <CardContent>
          {!other && cls.change?.type !== "cancelled" && <HeroTime cls={cls} />}
          <p className="type-body-strong tabular">
            {timeRange(cls)} · {roomText(cls.room)}
          </p>
          {!other && <ClassFacts cls={cls} withRoom={false} />}
          {moreChanges > 0 && (
            <p className="type-caption text-ink-2" data-testid="hero-more-changes">
              {moreChanges === 1
                ? "Сегодня изменилась ещё одна пара — она отмечена в списке ниже."
                : `Сегодня изменились ещё ${moreChanges} ${plural(moreChanges, ["пара", "пары", "пар"])} — они отмечены в списке ниже.`}
            </p>
          )}
        </CardContent>
        {other && (
          <CardContent className="border-t border-line pt-3" data-testid="hero-nearest">
            <p className="type-label text-accent">
              {Date.parse(other.startsAt) <= now.getTime()
                ? "Сейчас идёт"
                : `Ближайшая пара · через ${formatDuration(minutesBetween(now, other.startsAt))}`}
            </p>
            <h3 className="type-h3 break-words hyphens-auto">
              <span className="sr-only">Ближайшая пара: </span>
              {other.course.title}
            </h3>
            <HeroTime
              cls={other}
              detail={`${timeRange(other)} · ${CLASS_TYPE_LABEL[other.type]}`}
            />
            <ClassFacts cls={other} />
          </CardContent>
        )}
        <HeroActions cls={other ?? cls} />
      </Card>
    );
  }

  if (hero.kind === "now" || hero.kind === "soon") {
    const cls = byId(hero.classId);
    if (!cls) return null;
    const isNow = hero.kind === "now";
    const left = isNow ? minutesBetween(now, cls.endsAt) : minutesBetween(now, cls.startsAt);
    const total = Math.max(1, (Date.parse(cls.endsAt) - Date.parse(cls.startsAt)) / 60_000);
    const done = Math.min(
      100,
      Math.max(0, ((total - minutesBetween(now, cls.endsAt)) / total) * 100),
    );
    return (
      <Card data-hero={hero.kind} role="region" aria-label="Главное сейчас" className={HERO_PAPER}>
        <CardHeader>
          <p className="type-label text-accent">
            {isNow ? "Сейчас" : `Через ${formatDuration(left)}`}
          </p>
          <h2 className="type-h2 break-words hyphens-auto">{cls.course.title}</h2>
        </CardHeader>
        <CardContent>
          <HeroTime cls={cls} detail={`${timeRange(cls)} · ${CLASS_TYPE_LABEL[cls.type]}`} />
          {isNow && (
            <>
              <p className="type-body-strong">До конца {formatDuration(left)}</p>
              <div
                role="progressbar"
                aria-label="Сколько пары прошло"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(done)}
                className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
              >
                <div className="h-full rounded-full bg-accent" style={{ width: `${done}%` }} />
              </div>
            </>
          )}
          <ClassFacts cls={cls} />
        </CardContent>
        <HeroActions cls={cls} />
      </Card>
    );
  }

  const next = nextClassPhrase(hero.nextClassAt, now);
  if (hero.kind === "done_today") {
    return (
      <Card data-hero="done_today" role="region" aria-label="Главное сейчас" className={HERO_PAPER}>
        <CardHeader>
          <h2 className="type-h2">
            На сегодня всё <span aria-hidden>🎉</span>
          </h2>
          <p className="type-body text-ink-2">{next.short}</p>
        </CardHeader>
        <CardFooter>
          <Link href="/schedule?view=week" className={buttonVariants({ variant: "secondary" })}>
            Расписание на неделю
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card
      data-hero="day_off"
      role="region"
      aria-label="Главное сейчас"
      className={cn(HERO_PAPER, "items-center text-center")}
    >
      <Illustration name="free-day" />
      <h2 className="type-h2">Сегодня пар нет</h2>
      <p className="type-body text-ink-2">{next.long}</p>
      <Link href="/schedule?view=week" className={buttonVariants({ variant: "secondary" })}>
        Расписание на неделю
      </Link>
    </Card>
  );
}

/** Hero всегда первая карточка экрана; aria-live="off", чтобы минутный отсчёт не озвучивался сам (SPEC §6.2 п.1). */
export function Hero({ today, now }: { today: TodayDTO; now: Date }) {
  return (
    <div aria-live="off" data-slot="hero">
      <HeroContent today={today} now={now} />
    </div>
  );
}
