import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { IcsUrlDTO } from "@/contracts/api";
import { now } from "@/lib/clock";
import { buildCalendar, type IcsEvent } from "@/lib/ics";
import { deadlines } from "../../../db/schema";
import type { Tx } from "../db";
import {
  bumpFeedGeneration,
  deriveFeedToken,
  feedUrl,
  findFeedGeneration,
} from "../repositories/ics-tokens";
import {
  listChangesForClasses,
  listMyClasses,
  listMyCourseIds,
  type MyScheduleKeys,
} from "../repositories/schedule";

// Сервис календаря ICS (DS-22).
//
// • GET /api/me/ics — повторный вызов возвращает ту же ссылку, пока студент не сбросил
//   её (rotate): токен выводится из поколения и секрета, в БД только хеш
//   (repositories/ics-tokens.ts, docs/ds-questions/DS-22.md).
// • Корм: пары студента ±4 недели от now() (переносы применены, отмена — STATUS:CANCELLED)
//   и дедлайны со звёздочкой (без окна — подписка «догоняет» и старые, см. DS-22.md).

/** Окно корма: ±4 недели (28 дней) от now(). */
const FEED_WINDOW_DAYS = 28;
/** Дедлайн — короткое событие на момент dueAt. */
const DEADLINE_SLOT_MINUTES = 30;
const TYPE_RU: Record<string, string> = {
  lecture: "лекция",
  seminar: "семинар",
  practice: "практика",
  exam: "экзамен",
  consultation: "консультация",
};

/** Имя календаря (X-WR-CALNAME) для подписок в Google/iOS. */
const CAL_NAME = "Компас";

/** GET /api/me/ics: ссылка текущего поколения; подписки ещё нет — создаём первое. */
export async function getMyIcsUrl(tx: Tx, userId: string): Promise<IcsUrlDTO> {
  const generation =
    (await findFeedGeneration(tx, userId)) ?? (await bumpFeedGeneration(tx, userId));
  return { url: feedUrl(deriveFeedToken(userId, generation)) };
}

/**
 * POST /api/me/ics/rotate: следующее поколение, старый токен перестаёт работать. Без
 * withIdempotency: повтор rotate обязан выдать НОВЫЙ токен.
 */
export async function rotateIcsUrl(tx: Tx, userId: string): Promise<IcsUrlDTO> {
  const generation = await bumpFeedGeneration(tx, userId);
  return { url: feedUrl(deriveFeedToken(userId, generation)) };
}

type FeedChangeBundle = Awaited<ReturnType<typeof listChangesForClasses>>[number];

/** Последнее по времени изменение каждой пары (список уже отсортирован по createdAt asc). */
function latestChanges(bundles: FeedChangeBundle[]): Map<string, FeedChangeBundle> {
  const latest = new Map<string, FeedChangeBundle>();
  for (const bundle of bundles) latest.set(bundle.classId, bundle);
  return latest;
}

/**
 * Корм календаря (публичный GET /api/ics/:token.ics). Внутри withUserTx владельца токена:
 * deadlines — личная таблица; пары берутся готовым кодом репозитория расписания.
 */
export type IcsPart = "all" | "schedule" | "deadlines";

export async function buildIcsFeed(
  tx: Tx,
  keys: MyScheduleKeys,
  part: IcsPart = "all",
): Promise<string> {
  const at = now();
  const start = new Date(at.getTime() - FEED_WINDOW_DAYS * 24 * 3600_000);
  const end = new Date(at.getTime() + FEED_WINDOW_DAYS * 24 * 3600_000);

  const events: IcsEvent[] = [];
  if (part !== "deadlines") {
    const courseIds = await listMyCourseIds(tx, keys);
    const rows = await listMyClasses(tx, keys, courseIds, start, end);
    const bundles = rows.length
      ? await listChangesForClasses(
          tx,
          rows.map((row) => row.row.id),
        )
      : [];
    const latest = latestChanges(bundles);
    const counts = new Map<string, number>();
    for (const b of bundles) counts.set(b.classId, (counts.get(b.classId) ?? 0) + 1);

    for (const row of rows) {
      const bundle = latest.get(row.row.id);
      const change = bundle?.change;
      // Перенос/смена аудитории и преподавателя применяются на месте, как в ScheduleDTO.
      const room = bundle?.newRoom ?? row.room;
      const teacher = bundle?.newTeacher ?? row.teacher;
      events.push({
        uid: `class-${row.row.id}@kompas`,
        start: change?.newStartsAt ?? row.row.startsAt,
        end: change?.newEndsAt ?? row.row.endsAt,
        summary: `${row.course.shortTitle} (${TYPE_RU[row.row.type] ?? row.row.type})`,
        location: `${room.building} ${room.number}`,
        description: teacher.fullName,
        status: change?.type === "cancelled" ? "CANCELLED" : "CONFIRMED",
        sequence: counts.get(row.row.id) ?? 0,
        ...(change ? { lastModified: change.createdAt } : {}),
      });
    }
  }

  // Дедлайны со звёздочкой — на момент dueAt, любые даты (вне окна корма тоже).
  if (part !== "schedule") {
    const starred = await tx
      .select({ id: deadlines.id, title: deadlines.title, dueAt: deadlines.dueAt })
      .from(deadlines)
      .where(and(eq(deadlines.studentId, keys.studentId), eq(deadlines.starred, true)))
      .orderBy(asc(deadlines.dueAt));
    for (const deadline of starred) {
      events.push({
        uid: `deadline-${deadline.id}@kompas`,
        start: deadline.dueAt,
        end: new Date(deadline.dueAt.getTime() + DEADLINE_SLOT_MINUTES * 60_000),
        summary: `Дедлайн: ${deadline.title}`,
      });
    }
  }

  const name = part === "deadlines" ? "Компас · дедлайны" : CAL_NAME;
  return buildCalendar({ name, events, stamp: at });
}
