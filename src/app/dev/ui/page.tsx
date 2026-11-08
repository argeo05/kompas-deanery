import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRightLeft, CalendarPlus, MapPin, Sparkles } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardLink,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState, InlineError } from "@/components/ui/error-state";
import { GradeScale } from "@/components/ui/grade-scale";
import { NowLine } from "@/components/ui/now-line";
import { Illustration, type IllustrationName } from "@/components/ui/illustrations";
import { OfflineBar } from "@/components/ui/offline-bar";
import { LoadingRegion, Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { Badge, REQUEST_STATUS, SEMESTER_STATUS, StatusBadge } from "@/components/ui/status-badge";
import { COURSE_COLOR_CLASSES } from "@/lib/course-color";
import { devUiEnabled } from "@/lib/dev-ui";
import type { RequestStatus, SemesterStatus } from "@/contracts/api";
import { LoadingButtonDemo, SheetDemo, ToastDemo } from "./demos";

// Витрина дизайн-системы (этап C2): все компоненты §7.4 и их состояния. Только в разработке.

export const metadata: Metadata = {
  title: "Витрина интерфейса — Компас",
  robots: { index: false, follow: false },
};

const SURFACES = [
  { name: "--bg", cls: "bg-bg" },
  { name: "--surface", cls: "bg-surface" },
  { name: "--surface-2", cls: "bg-surface-2" },
  { name: "--line", cls: "bg-line" },
  { name: "--line-strong", cls: "bg-line-strong" },
  { name: "--ink", cls: "bg-ink" },
  { name: "--ink-2", cls: "bg-ink-2" },
  { name: "--accent", cls: "bg-accent" },
  { name: "--ok", cls: "bg-ok" },
  { name: "--warn", cls: "bg-warn" },
  { name: "--coral", cls: "bg-coral" },
  { name: "--alert", cls: "bg-alert" },
];

// Роли типографики (SPEC §7.2, src/styles/typography.css).
const TYPE_ROLES = [
  { cls: "type-display", name: "display", spec: "Unbounded 32 / 40" },
  { cls: "type-h1", name: "h1", spec: "Onest 24 / 32, 600" },
  { cls: "type-h2", name: "h2", spec: "Onest 20 / 24, 600" },
  { cls: "type-h3", name: "h3", spec: "Onest 18 / 20, 600" },
  { cls: "type-body", name: "body", spec: "Onest 16, 400" },
  { cls: "type-body-strong", name: "body-strong", spec: "Onest 16, 500" },
  { cls: "type-caption", name: "caption", spec: "Onest 14, 400" },
  { cls: "type-label", name: "метка статуса", spec: "Onest 12, 600, прописные" },
  { cls: "type-nav", name: "подпись навигации", spec: "Onest 12 / 16, 500" },
  { cls: "type-num", name: "цифры", spec: "Onest 600, tabular-nums" },
];

const ILLUSTRATIONS: { name: IllustrationName; label: string }[] = [
  { name: "free-day", label: "Свободный день" },
  { name: "all-done", label: "Всё сделано" },
  { name: "offline", label: "Нет сети" },
  { name: "no-requests", label: "Нет заявок" },
  { name: "nothing-found", label: "Ничего не найдено" },
  { name: "error", label: "Ошибка" },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="type-h2">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function DevUiPage() {
  if (!devUiEnabled()) notFound();

  return (
    <AppShell
      role="student"
      initials="АС"
      badges={{ schedule: true, study: 2, requests: true, more: 3, notifications: 3 }}
    >
      <header className="flex flex-col gap-1">
        <h1 className="type-display">Витрина интерфейса</h1>
        <p className="text-ink-2">
          Токены «Бумага и чернила» и компоненты кабинета. Страница видна только в разработке.
        </p>
      </header>

      <Section id="colors" title="Цвета">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {SURFACES.map((s) => (
            <li key={s.name} className="flex flex-col gap-1 text-sm">
              <span aria-hidden className={`h-12 rounded-control border border-line ${s.cls}`} />
              <code className="text-ink-2">{s.name}</code>
            </li>
          ))}
        </ul>
        <h3 className="type-h3">Цвета дисциплин</h3>
        <ul className="flex flex-wrap gap-2" aria-label="Десять цветов дисциплин">
          {COURSE_COLOR_CLASSES.map((cls, i) => (
            <li
              key={cls}
              className="flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-sm shadow-card"
            >
              <span aria-hidden className={`size-3 rounded-full ${cls}`} />
              {i}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="type" title="Типографика">
        <ul className="flex flex-col gap-2">
          {TYPE_ROLES.map((t) => (
            <li
              key={t.cls}
              className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3"
            >
              <span className="shrink-0 type-caption text-ink-2 sm:w-56">
                {t.name} · {t.spec}
              </span>
              <span className={`${t.cls} min-w-0`}>
                {t.cls === "type-display" || t.cls === "type-num" ? "15:20" : "Макроэкономика"}
              </span>
            </li>
          ))}
        </ul>
        <h3 className="type-h3">Оценка «98 / Отлично / A»</h3>
        <div className="flex max-w-md flex-col gap-4">
          <Card>
            <GradeScale total={98} mark={{ word: "Отлично", letter: "A" }} variant="card" />
          </Card>
          <Card className="flex-row items-start justify-between gap-3">
            <p className="type-h3">Макроэкономика</p>
            <GradeScale total={74} mark={{ word: "Хорошо", letter: "C" }} />
          </Card>
        </div>
        <h3 className="type-h3">Линия «сейчас»</h3>
        <ul className="max-w-md">
          <NowLine now={new Date("2026-11-12T12:40:00+03:00")} />
        </ul>
        <p className="max-w-prose">
          Основной текст — Onest 16 px, высота строки 1,5. Длинные слова вроде «межфакультетский» и
          «административно-хозяйственный» переносятся по слогам, а не вылезают за край экрана.
        </p>
      </Section>

      <Section id="buttons" title="Кнопки">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Заказать справку</Button>
          <Button variant="secondary">Добавить в календарь</Button>
          <Button variant="ghost">Показать все пары</Button>
          <Button variant="danger">Отменить заявку</Button>
          <Button variant="link">Подробнее</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Маленькая</Button>
          <Button size="md">Средняя</Button>
          <Button size="lg">Большая</Button>
          <Button size="icon" variant="secondary" aria-label="Добавить в календарь">
            <CalendarPlus aria-hidden />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LoadingButtonDemo />
          <Button loading variant="secondary">
            Отправляем
          </Button>
          <Button disabled>Недоступна</Button>
        </div>
      </Section>

      <Section id="cards" title="Карточки">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Справка об обучении</CardTitle>
              <CardDescription>Обычная карточка</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Электронная, с QR-кодом проверки. Обычно готова за 1 рабочий день.</p>
            </CardContent>
          </Card>
          <Card variant="interactive">
            <CardHeader>
              <CardLink href="/requests">Заявка № 2026-0142</CardLink>
              <CardDescription>Вся карточка — ссылка</CardDescription>
            </CardHeader>
            <StatusBadge
              kind="request"
              status="needs_info"
              label="Нужно уточнение — ответьте до пт"
            />
          </Card>
          <Card variant="highlight">
            <Badge tone="warn" icon={ArrowRightLeft}>
              Перенос
            </Badge>
            <CardHeader>
              <CardTitle className="text-2xl">Макроэкономика</CardTitle>
              <CardDescription className="text-base tabular">
                12:40 → 15:20 · ауд. 4012
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button size="sm">Открыть</Button>
              <Button size="sm" variant="secondary">
                <MapPin aria-hidden />
                Где аудитория
              </Button>
            </CardFooter>
          </Card>
        </div>
      </Section>

      <Section id="badges" title="Статусы">
        <h3 className="type-h3">Заявки</h3>
        <ul className="flex flex-wrap gap-2">
          {(Object.keys(REQUEST_STATUS) as RequestStatus[]).map((s) => (
            <li key={s}>
              <StatusBadge kind="request" status={s} />
            </li>
          ))}
        </ul>
        <h3 className="type-h3">Семестр</h3>
        <ul className="flex flex-wrap gap-2">
          {(Object.keys(SEMESTER_STATUS) as SemesterStatus[]).map((s) => (
            <li key={s}>
              <StatusBadge kind="semester" status={s} />
            </li>
          ))}
        </ul>
        <h3 className="type-h3">Метки</h3>
        <div className="flex flex-wrap gap-2">
          <Badge tone="warn" icon={ArrowRightLeft}>
            Перенос
          </Badge>
          <Badge tone="info" icon={Sparkles}>
            Новое
          </Badge>
          <Badge tone="alert">Пара отменена</Badge>
        </div>
      </Section>

      <Section id="empty" title="Пустые состояния">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <EmptyState
              illustration="free-day"
              title={
                <>
                  На сегодня всё <span aria-hidden>🎉</span>
                </>
              }
              headingLevel="h3"
            >
              Пар больше нет. Завтра первая — в 09:30.
            </EmptyState>
          </Card>
          <Card>
            <EmptyState
              illustration="no-requests"
              title="Заявок пока нет"
              headingLevel="h3"
              action={<Button>Заказать справку</Button>}
            >
              Справку об обучении можно заказать в три шага.
            </EmptyState>
          </Card>
        </div>
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {ILLUSTRATIONS.map((il) => (
            <li
              key={il.name}
              className="flex flex-col items-center gap-2 text-center type-caption text-ink-2"
            >
              <Illustration name={il.name} />
              {il.label}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="loading" title="Загрузка">
        <LoadingRegion label="Загружаем расписание…" className="max-w-md">
          <SkeletonCard />
          <SkeletonCard />
          <div className="flex items-center gap-3">
            <Skeleton shape="circle" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="w-1/2" />
              <Skeleton className="w-1/3" />
            </div>
          </div>
        </LoadingRegion>
      </Section>

      <Section id="errors" title="Ошибки">
        <Card>
          <ErrorState
            title="Не получилось загрузить расписание"
            headingLevel="h3"
            action={<Button variant="secondary">Повторить</Button>}
          >
            Сервер не ответил. Попробуйте ещё раз через минуту — данные никуда не денутся.
          </ErrorState>
        </Card>
        <InlineError
          action={
            <Button size="sm" variant="secondary">
              Повторить
            </Button>
          }
        >
          Не получилось сохранить заметку: пропал интернет.
        </InlineError>
      </Section>

      <Section id="offline" title="Нет сети">
        <OfflineBar
          forceOffline
          dataAt="2026-11-12T08:14:00+03:00"
          className="overflow-hidden rounded-control"
        />
      </Section>

      <Section id="toast" title="Всплывающие сообщения">
        <ToastDemo />
      </Section>

      <Section id="sheet" title="Нижний лист">
        <SheetDemo />
      </Section>
    </AppShell>
  );
}
