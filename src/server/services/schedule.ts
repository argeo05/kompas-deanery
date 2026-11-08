import "server-only";
import { and, eq } from "drizzle-orm";
import type { ClassDTO, ScheduleChangeDTO, ScheduleDTO, UUID, WeekParity } from "@/contracts/api";
import { now } from "@/lib/clock";
import { addDaysMsk, startOfDayMsk, toMsk } from "@/lib/time";
import { classNotes } from "../../../db/schema/study";
import type { Tx } from "../db";
import { HttpError } from "../http";
import {
  isMyClass,
  listChangesForClasses,
  listMyClassNotes,
  listMyClasses,
  listMyCourseIds,
  listSeenChangeIds,
  markChangesSeen,
  type MyScheduleKeys,
} from "../repositories/schedule";

// Сервис расписания студента (DS-11): собирает ScheduleDTO из строк репозитория.
// Применение schedule_changes к выдаче — SPEC §6.3 п.5:
//   перенос — пара показывается на новом месте, на старом остаётся «призрак» (ghostSlots).

type ChangeBundle = Awaited<ReturnType<typeof listChangesForClasses>>[number];
type ClassRow = Awaited<ReturnType<typeof listMyClasses>>[number];

/** Номер ISO-недели даты «from» (неделя начинается в понедельник) — «Неделя N · числитель», SPEC §6.3 п.4. */
function isoWeekNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday); // четверг текущей недели
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 4 - (firstThursday.getUTCDay() || 7));
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600_000));
}

function weekParityOf(weekNumber: number): WeekParity {
  return weekNumber % 2 === 0 ? "even" : "odd";
}

/** Последнее по времени изменение для каждой пары (список отсортирован по createdAt asc, id asc). */
function latestChanges(changes: ChangeBundle[]): Map<string, ChangeBundle> {
  const latest = new Map<string, ChangeBundle>();
  for (const c of changes) latest.set(c.classId, c);
  return latest;
}

function toChangeDTO(
  bundle: ChangeBundle,
  original: ClassRow,
  seenIds: Set<string>,
): ScheduleChangeDTO {
  const c = bundle.change;
  return {
    id: c.id,
    type: c.type,
    previous:
      c.type === "added"
        ? null
        : {
            startsAt: toMsk(original.row.startsAt),
            endsAt: toMsk(original.row.endsAt),
            roomNumber: original.room.number,
          },
    reason: c.reason,
    createdAt: toMsk(c.createdAt),
    seen: seenIds.has(c.id),
  };
}

function toClassDTO(
  original: ClassRow,
  bundle: ChangeBundle | undefined,
  change: ScheduleChangeDTO | null,
  note: string | null,
): ClassDTO {
  const c = bundle?.change;
  const room = bundle?.newRoom ?? original.room;
  const teacher = bundle?.newTeacher ?? original.teacher;
  return {
    id: original.row.id,
    course: {
      id: original.course.id,
      title: original.course.title,
      shortTitle: original.course.shortTitle,
      colorIndex: original.course.colorIndex,
    },
    type: original.row.type,
    startsAt: toMsk(c?.newStartsAt ?? original.row.startsAt),
    endsAt: toMsk(c?.newEndsAt ?? original.row.endsAt),
    room: {
      id: room.id,
      building: room.building,
      number: room.number,
      floor: room.floor,
      hint: room.hint,
    },
    teacher: {
      id: teacher.id,
      fullName: teacher.fullName,
      email: teacher.email,
      officeHours: teacher.officeHours,
    },
    weekParity: original.row.weekParity,
    change,
    note,
  };
}

/** GET /api/me/schedule?from=&to=: расписание группы + личных курсов, changes применены, ghosts на старых местах. */
export async function getMySchedule(
  tx: Tx,
  keys: MyScheduleKeys,
  range: { from: string; to: string },
): Promise<ScheduleDTO> {
  const courseIds = await listMyCourseIds(tx, keys);
  const start = startOfDayMsk(range.from);
  const end = addDaysMsk(startOfDayMsk(range.to), 1); // тот же диапазон схемы — [from 00:00, день после to 00:00)
  const rows = await listMyClasses(tx, keys, courseIds, start, end);

  const byId = new Map(rows.map((r) => [r.row.id, r]));
  const changes = rows.length
    ? await listChangesForClasses(
        tx,
        rows.map((r) => r.row.id),
      )
    : [];
  const latest = latestChanges(changes);
  const seenIds = changes.length
    ? await listSeenChangeIds(
        tx,
        keys.studentId,
        changes.map((c) => c.change.id),
      )
    : new Set<string>();
  const notes = rows.length
    ? await listMyClassNotes(tx, keys.studentId)
    : new Map<string, string>();

  const inRange = (d: Date | string) => {
    const t = new Date(d).getTime();
    return t >= start.getTime() && t < end.getTime();
  };
  // На сетке — пары, чьё эффективное (после переноса) время в диапазоне; перенесённая
  // за границу диапазона пара остаётся здесь только призраком (ghostSlots ниже).
  const classes = rows
    .map((r) => {
      const bundle = latest.get(r.row.id);
      return toClassDTO(
        r,
        bundle,
        bundle ? toChangeDTO(bundle, r, seenIds) : null,
        notes.get(r.row.id) ?? null,
      );
    })
    .filter((c) => inRange(c.startsAt));
  // Сортируем уже по эффективному (после переносов) времени начала.
  classes.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));

  const ghostSlots: ScheduleDTO["ghostSlots"] = [];
  for (const bundle of latest.values()) {
    if (bundle.change.type === "moved" && bundle.change.newStartsAt) {
      const original = byId.get(bundle.classId);
      // Призрак — только на исходном месте внутри диапазона.
      if (original && inRange(original.row.startsAt))
        ghostSlots.push({
          classId: bundle.classId,
          originalStartsAt: toMsk(original.row.startsAt),
          movedTo: toMsk(bundle.change.newStartsAt),
        });
    }
  }

  const weekNumber = isoWeekNumber(range.from);
  return {
    from: range.from,
    to: range.to,
    weekNumber,
    weekParity: weekParityOf(weekNumber),
    classes,
    ghostSlots,
  };
}

/** POST /api/me/schedule/changes/seen: только свои изменения, чужие id молча отбрасываются. */
export async function markMyChangesSeen(
  tx: Tx,
  keys: MyScheduleKeys,
  changeIds: UUID[],
): Promise<void> {
  return markChangesSeen(tx, keys, changeIds);
}

/**
 * PUT /api/me/classes/:classId/note: создать или заменить заметку, пустая строка — удалить.
 * Пара должна принадлежать расписанию студента (группа или его enrollments), иначе 404.
 */
export async function setMyClassNote(
  tx: Tx,
  keys: MyScheduleKeys,
  classId: string,
  rawText: string,
): Promise<string | null> {
  const text = rawText.trim();
  const courseIds = await listMyCourseIds(tx, keys);
  if (!(await isMyClass(tx, keys, courseIds, classId))) {
    throw new HttpError(404, "NOT_FOUND");
  }

  if (text === "") {
    await tx
      .delete(classNotes)
      .where(and(eq(classNotes.studentId, keys.studentId), eq(classNotes.classId, classId)));
    return null;
  }

  await tx
    .insert(classNotes)
    .values({ studentId: keys.studentId, classId, text })
    .onConflictDoUpdate({
      target: [classNotes.studentId, classNotes.classId],
      set: { text, updatedAt: now() },
    });
  return text;
}
