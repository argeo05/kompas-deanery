import "server-only";
import type { DeadlineDTO, HotItem, TodayDTO } from "@/contracts/api";
import { now } from "@/lib/clock";
import { addDaysMsk, mskParts, toMsk, toMskDate } from "@/lib/time";
import { pickHero } from "@/lib/today";
import type { StudentCtx } from "../auth/guards";
import type { Tx } from "../db";
import type { MyScheduleKeys } from "../repositories/schedule";
import { listDeadlinesForStudent, listPlansForStudent } from "../repositories/deadlines";
import { listRequestsForStudent } from "../repositories/requests";
import { HOT_MS, latestPlans, toDeadlineDTO } from "./deadlines";
import { toRequestDTO } from "./requests";
import { getMySchedule } from "./schedule";
import { listStudentAnnouncements } from "./announcements";

// Агрегат главной «Сегодня» (DS-20, SPEC §6.2): собран из готовых сервисов.
//   • Пары дня — getMySchedule из DS-11 (from=to=today): изменения применены, заметки подключены.
//     Эти же данные — вход pickHero (DS-07), поэтому hero и classes не расходятся.
//   • nextClassAt для веток done_today / day_off — окно 7 дней: по эффективному (после переносов)
//     расписанию, отменённые пары не считаются ближайшими.
//   • hot — SPEC §6.2: дедлайны ≤ 48 ч (не сделанные, та же граница, что «горит» в DS-15, ≤ 2),
//     затем заявки ready/needs_info (свежая, ≤ 1). Итого ≤ 3.
//   • news — первые 2 объявления в порядке леты DS-31 (publishAt ≤ now < expiresAt, аудитория).

const HOT_DEADLINE_LIMIT = 2;
const HOT_TOTAL = 3;
/** Окно поиска ближайшей будущей пары (DS-20: вместо ±4 недель достаточно 7 дней). */
const NEXT_WINDOW_DAYS = 7;

/** Статусы заявок для блока «важное» (в контракте: ready / needs_info). */
const HOT_REQUEST_STATUSES = ["ready", "needs_info"] as const;

function scheduleKeys(ctx: StudentCtx): MyScheduleKeys {
  return { studentId: ctx.studentId, groupId: ctx.groupId };
}

/** Приветствие по московскому времени: 5–11 утро, 12–17 день, 18–22 вечер, остальное — ночь. */
function greetingOf(hour: number): TodayDTO["greeting"] {
  if (hour < 5) return "night";
  if (hour < 12) return "morning";
  if (hour < 18) return "day";
  return hour < 23 ? "evening" : "night";
}

/** GET /api/me/today: сборка TodayDTO одним порядковым набором запросов — без N+1. */
export async function getMyToday(tx: Tx, ctx: StudentCtx): Promise<TodayDTO> {
  const at = now();
  const nowMs = at.getTime();
  const nowIso = toMsk(at);
  const today = toMskDate(at);

  const day = await getMySchedule(tx, scheduleKeys(ctx), { from: today, to: today });
  const classes = day.classes; // уже отсортированы по эффективному startsAt
  const unseenChanges = classes.flatMap((c) => (c.change && !c.change.seen ? [c.change] : []));

  const week = await getMySchedule(tx, scheduleKeys(ctx), {
    from: today,
    to: toMskDate(addDaysMsk(at, NEXT_WINDOW_DAYS)),
  });
  const nextClassAt =
    week.classes.find(
      (c) => c.change?.type !== "cancelled" && new Date(c.startsAt).getTime() > nowMs,
    )?.startsAt ?? null;

  // Горячие дедлайны: не сделанные и срок ≤ 48 ч (строки приходят отсортированными по dueAt).
  const planById = latestPlans(await listPlansForStudent(tx, ctx.studentId));
  const hot: HotItem[] = [];
  const hotDeadlines: DeadlineDTO[] = [];
  for (const row of await listDeadlinesForStudent(tx, ctx.studentId)) {
    const d = row.deadline;
    if (d.doneAt !== null || d.dueAt.getTime() - nowMs > HOT_MS) continue;
    hotDeadlines.push(toDeadlineDTO(row, planById, at));
    if (hotDeadlines.length === HOT_DEADLINE_LIMIT) break;
  }
  for (const deadline of hotDeadlines) hot.push({ kind: "deadline", deadline });

  // Заявки ready/needs_info: одна, самая свежая (список идёт createdAt desc).
  const [activeRequest] = await listRequestsForStudent(tx, ctx.studentId, {
    statuses: [...HOT_REQUEST_STATUSES],
    cursor: null,
    limit: 1,
  });
  if (activeRequest && hot.length < HOT_TOTAL) {
    hot.push({ kind: "request", request: toRequestDTO(activeRequest, at) });
  }

  const feed = await listStudentAnnouncements(tx, ctx, { limit: 2 });
  const news = feed.items.map((a) => ({
    id: a.id,
    title: a.title,
    important: a.important,
    publishedAt: a.publishedAt,
  }));

  return {
    now: nowIso,
    greeting: greetingOf(mskParts(at).hour),
    hero: pickHero(nowIso, classes, unseenChanges, nextClassAt),
    classes,
    passedCount: classes.filter((c) => new Date(c.startsAt).getTime() <= nowMs).length,
    hot,
    news,
    dataAsOf: nowIso,
  };
}
