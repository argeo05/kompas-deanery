"use client";

import * as React from "react";
import Link from "next/link";
import { InstallPrompt } from "@/components/offline/install-guide";
import { ApiView } from "@/components/screens/api-view";
import { useStudent } from "@/components/shell/student-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { LoadingRegion, Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import type { TodayDTO } from "@/contracts/api";
import { formatDateLong } from "@/lib/format";
import { mskParts } from "@/lib/time";
import { greetingOf } from "@/lib/today";
import { useApi } from "@/lib/use-api";
import { useNow } from "@/lib/use-now";
import { DayFeed } from "./day-feed";
import { Hero } from "./hero";
import { HotList, NewsList } from "./hot-and-news";

// Экран «Сегодня» (SPEC §6.2, §7.5). Данные — GET /api/me/today, опрос раз в минуту (AC-2.3) и
// обновление при возврате на вкладку; потяни вниз на мобильной — обновить.

const GREETING: Record<TodayDTO["greeting"], string> = {
  morning: "Доброе утро",
  day: "Добрый день",
  evening: "Добрый вечер",
  night: "Доброй ночи",
};

const POLL_MS = 60_000;
const PULL_PX = 80;

/** Потянуть вниз от верха страницы (мобильная): жест не заменяет кнопку, обновление идёт и само. */
function usePullToRefresh(onRefresh: () => void) {
  React.useEffect(() => {
    let startY: number | null = null;
    const start = (e: TouchEvent) => {
      startY = window.scrollY <= 0 ? (e.touches[0]?.clientY ?? null) : null;
    };
    const end = (e: TouchEvent) => {
      const y = e.changedTouches[0]?.clientY;
      if (startY !== null && y !== undefined && y - startY > PULL_PX && window.scrollY <= 0)
        onRefresh();
      startY = null;
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchend", end, { passive: true });
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchend", end);
    };
  }, [onRefresh]);
}

function TodaySkeleton() {
  return (
    <LoadingRegion label="Загружаем ваш день…">
      <SkeletonCard className="h-44" />
      <Skeleton className="mt-2 h-6 w-1/3" />
      <SkeletonCard />
      <SkeletonCard />
    </LoadingRegion>
  );
}

function TodayContent({ today }: { today: TodayDTO }) {
  const now = useNow(today.now);
  const hasSide = today.hot.length > 0 || today.news.length > 0;
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:items-start lg:gap-8">
      <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
        <Hero today={today} now={now} />
        <DayFeed classes={today.classes} now={now} />
      </div>
      {hasSide ? (
        <div className="flex min-w-0 flex-col gap-6">
          <HotList items={today.hot} now={now} />
          <NewsList items={today.news} />
        </div>
      ) : (
        <p className="type-body text-ink-2">
          Срочного нет.{" "}
          <Link
            href="/schedule?view=week"
            className={buttonVariants({ variant: "link", size: "sm" })}
          >
            Посмотреть неделю
          </Link>
        </p>
      )}
    </div>
  );
}

/** serverNow — время сервера для первого HTML; в офлайн-оболочке его нет, тогда дата ждёт данных. */
export function TodayScreen({ serverNow }: { serverNow?: string }) {
  const { userId, displayName } = useStudent();
  const api = useApi<TodayDTO>("/api/me/today", { scope: userId, refreshMs: POLL_MS });
  usePullToRefresh(api.reload);
  const now = useNow(api.data?.now ?? serverNow);
  const greeting = api.data?.greeting ?? (serverNow ? greetingOf(mskParts(serverNow).hour) : null);
  const showDate = !!(api.data || serverNow);

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-[1_1_10rem] flex-col gap-1 [overflow-wrap:anywhere]">
          <h1 className="type-h1 lg:type-display">
            {greeting ? GREETING[greeting] : "Здравствуйте"}, {displayName}
          </h1>
          {showDate && (
            <p className="type-body text-ink-2">
              {formatDateLong(now)} · по Москве
              {api.justUpdated && !api.error && " · обновлено только что"}
            </p>
          )}
        </div>
        {api.data && (
          <Button
            variant="ghost"
            size="sm"
            className="-mt-1 shrink-0"
            onClick={api.reload}
            loading={api.refreshing}
          >
            Обновить
          </Button>
        )}
      </header>
      <ApiView api={api} skeleton={<TodaySkeleton />}>
        {(today) => <TodayContent today={today} />}
      </ApiView>
      <InstallPrompt />
    </>
  );
}
