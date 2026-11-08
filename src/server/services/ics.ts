import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { createEvents, type EventAttributes } from "ics";
import type { IcsUrlDTO } from "@/contracts/api";
import { now } from "@/lib/clock";
import { deadlines } from "../../../db/schema";
import type { Tx } from "../db";
import {
  feedTokenHash,
  feedUrl,
  findCachedFeedToken,
  findTokenHashByUserId,
  generateFeedToken,
  putCachedFeedToken,
  putTokenHash,
} from "../repositories/ics-tokens";
import {
  listChangesForClasses,
  listMyClasses,
  listMyCourseIds,
  type MyScheduleKeys,
} from "../repositories/schedule";

// Сервис календаря ICS (DS-22).
//
// • GET /api/me/ics — idempotent: повторный вызов возвращает ту же ссылку, пока
//   студент не сбросил её (rotate). Токен в БД только хешем, сырой токен — в кэше
//   ответа (repositories/ics-tokens.ts, docs/ds-questions/DS-22.md).
// • Корм: пары студента ±4 недели от now() (переносы применены, отмена — STATUS:CANCELLED)
//   и дедлайны со звёздочкой (без окна — подписка «догоняет» и старые, см. DS-22.md).

/** Окно корма: ±4 недели (28 дней) от now(). */
const FEED_WINDOW_DAYS = 28;
/** Дедлайн — короткое событие на момент dueAt. */
const DEADLINE_SLOT_MINUTES = 30;
/** Имя календаря (X-WR-CALNAME) для подписок в Google/iOS. */
const CAL_NAME = "Компас";

/** Момент в UTC-свёртке [Y, M, D, h, m] для ics (startInputType: "utc"). */
function utcParts(date: Date): [number, number, number, number, number] {
  return [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
  ];
}

/** Собрать строку календаря; ошибка библиотеки — 500 (route() отдаёт INTERNAL). */
function calendarOf(events: EventAttributes[]): string {
  const { error, value } = createEvents(events, { calName: CAL_NAME });
  if (error || !value) throw error ?? new Error("ics: пустой календарь");
  return value;
}

/**
 * GET /api/me/ics: кэш ссылки валиден, пока его токен совпадает с хешем в ics_tokens.
 * Кэша нет или он отстал (например, ежедневный сброс демо-данных) — тихо создаём новый
 * токен: прежнюю ссылку всё равно восстановить нельзя.
 */
export async function getMyIcsUrl(tx: Tx, userId: string): Promise<IcsUrlDTO> {
  const tokenHash = await findTokenHashByUserId(tx, userId);
  const cached = await findCachedFeedToken(tx, userId);
  if (tokenHash && cached && feedTokenHash(cached) === tokenHash) {
    return { url: feedUrl(cached) };
  }
  return rotateIcsUrl(tx, userId);
}

/**
 * POST /api/me/ics/rotate: новый токен, старый перестаёт работать (upsert по user_id —
 * один токен на студента). Без withIdempotency: повтор rotate обязан выдать НОВЫЙ
 * токен, возврат сохранённого ответа был бы бессмыслен.
 */
export async function rotateIcsUrl(tx: Tx, userId: string): Promise<IcsUrlDTO> {
  const token = generateFeedToken();
  await putTokenHash(tx, userId, feedTokenHash(token));
  await putCachedFeedToken(tx, userId, token);
  return { url: feedUrl(token) };
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
export async function buildIcsFeed(tx: Tx, keys: MyScheduleKeys): Promise<string> {
  const at = now();
  const start = new Date(at.getTime() - FEED_WINDOW_DAYS * 24 * 3600_000);
  const end = new Date(at.getTime() + FEED_WINDOW_DAYS * 24 * 3600_000);

  const courseIds = await listMyCourseIds(tx, keys);
  const rows = await listMyClasses(tx, keys, courseIds, start, end);
  const bundles = rows.length
    ? await listChangesForClasses(
        tx,
        rows.map((row) => row.row.id),
      )
    : [];
  const latest = latestChanges(bundles);

  const events: EventAttributes[] = rows.map((row) => {
    const bundle = latest.get(row.row.id);
    const change = bundle?.change;
    // Перенос/смена аудитории и преподавателя применяются на месте, как в ScheduleDTO.
    const room = bundle?.newRoom ?? row.room;
    const teacher = bundle?.newTeacher ?? row.teacher;
    return {
      start: utcParts(change?.newStartsAt ?? row.row.startsAt),
      startInputType: "utc",
      end: utcParts(change?.newEndsAt ?? row.row.endsAt),
      endInputType: "utc",
      title: `${row.course.shortTitle} (${row.row.type})`,
      location: `${room.building} ${room.number}`,
      description: teacher.fullName,
      uid: `class-${row.row.id}@kompas`,
      ...(change?.type === "cancelled" ? { status: "CANCELLED" as const } : {}),
    };
  });

  // Дедлайны со звёздочкой — на момент dueAt, любые даты (вне окна корма тоже).
  const starred = await tx
    .select({ id: deadlines.id, title: deadlines.title, dueAt: deadlines.dueAt })
    .from(deadlines)
    .where(and(eq(deadlines.studentId, keys.studentId), eq(deadlines.starred, true)))
    .orderBy(asc(deadlines.dueAt));
  for (const deadline of starred) {
    events.push({
      start: utcParts(deadline.dueAt),
      startInputType: "utc",
      duration: { minutes: DEADLINE_SLOT_MINUTES },
      title: `Дедлайн: ${deadline.title}`,
      uid: `deadline-${deadline.id}@kompas`,
    });
  }

  return calendarOf(events);
}
