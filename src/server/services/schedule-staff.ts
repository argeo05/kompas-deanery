import "server-only";
import { count, eq, inArray } from "drizzle-orm";
import type { ScheduleChangeDTO, StaffClassDTO, StaffClassesDTO, UUID } from "@/contracts/api";
import { now } from "@/lib/clock";
import { addDaysMsk, startOfDayMsk, toMsk, toMskDate } from "@/lib/time";
import { enrollments, rooms, scheduleChanges, studentProfiles, teachers } from "../../../db/schema";
import type { StaffCtx } from "../auth/guards";
import type { Tx } from "../db";
import { audit } from "../audit";
import { HttpError } from "../http";
import { listChangesForClasses } from "../repositories/schedule";
import {
  findClassForStaff,
  listStaffClasses,
  type StaffClassRow,
} from "../repositories/schedule-staff";
import type { ScheduleChangeInput, StaffClassesQuery } from "../schemas/schedule-staff";
import { renderNotification, type NotifyParams, type NotifyKey } from "../notify-templates";
import { notify } from "./notify";

// Сервис расписания сотрудника (DS-32). Формат выдачи соответствует чтению студентом
// (src/server/services/schedule.ts): последнее по времени изменение расписания применено
// к времени, аудитории и преподавателю пары. Записи schedule_changes может быть несколько —
// новое изменение создаётся поверх предыдущего; уникальности на class_id в схеме нет.
// Уведомление получают все студенты пары: группа (group-based) или записанные на курс
// (потоковая пара, audience.courses — тот же набор, что читает студент в DS-11).

type ChangeBundle = Awaited<ReturnType<typeof listChangesForClasses>>[number];

/** Последнее по времени изменение каждой пары (список отсортирован по createdAt asc, id asc). */
function latestChanges(changes: ChangeBundle[]): Map<string, ChangeBundle> {
  const latest = new Map<string, ChangeBundle>();
  for (const c of changes) latest.set(c.classId, c);
  return latest;
}

function toChangeDTO(bundle: ChangeBundle, original: StaffClassRow): ScheduleChangeDTO {
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
    seen: false,
  };
}

function toClassDTO(
  original: StaffClassRow,
  bundle: ChangeBundle | undefined,
  change: ScheduleChangeDTO | null,
  audienceSize: number,
): StaffClassDTO {
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
    group: original.group ? { id: original.group.id, title: original.group.title } : null,
    audienceSize,
  };
}

/** Сколько студентов получат уведомление об изменении пары: группа или записанные на курс (потоковая пара). */
async function audienceSizes(tx: Tx, rows: StaffClassRow[]): Promise<Map<string, number>> {
  const groupIds = [...new Set(rows.flatMap((r) => (r.row.groupId ? [r.row.groupId] : [])))];
  const streamCourseIds = [
    ...new Set(rows.flatMap((r) => (r.row.groupId ? [] : [r.course.id]))),
  ];
  const byGroup = new Map<string, number>();
  const byCourse = new Map<string, number>();
  if (groupIds.length) {
    const found = await tx
      .select({ id: studentProfiles.groupId, n: count() })
      .from(studentProfiles)
      .where(inArray(studentProfiles.groupId, groupIds))
      .groupBy(studentProfiles.groupId);
    for (const r of found) byGroup.set(r.id, r.n);
  }
  if (streamCourseIds.length) {
    const found = await tx
      .select({ id: enrollments.courseId, n: count() })
      .from(enrollments)
      .where(inArray(enrollments.courseId, streamCourseIds))
      .groupBy(enrollments.courseId);
    for (const r of found) byCourse.set(r.id, r.n);
  }
  return new Map(
    rows.map((r) => [
      r.row.id,
      r.row.groupId ? (byGroup.get(r.row.groupId) ?? 0) : (byCourse.get(r.course.id) ?? 0),
    ]),
  );
}

// ── GET /api/staff/classes?date=&groupId= ────────────────────────────────────

/** Пары дня (или группы) в области видимости сотрудника, изменения применены. */
export async function listStaffClassesForDay(
  tx: Tx,
  ctx: StaffCtx,
  q: StaffClassesQuery,
): Promise<StaffClassesDTO> {
  const start = startOfDayMsk(q.date);
  const rows = await listStaffClasses(
    tx,
    { facultyId: ctx.facultyId },
    { start, end: addDaysMsk(start, 1), groupId: q.groupId },
  );

  const changes = rows.length
    ? await listChangesForClasses(
        tx,
        rows.map((r) => r.row.id),
      )
    : [];
  const latest = latestChanges(changes);

  const sizes = await audienceSizes(tx, rows);
  const items = rows.map((row) => {
    const bundle = latest.get(row.row.id);
    return toClassDTO(
      row,
      bundle,
      bundle ? toChangeDTO(bundle, row) : null,
      sizes.get(row.row.id) ?? 0,
    );
  });
  items.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
  return { items };
}

// ── POST /api/staff/classes/:id/changes ─────────────────────────────────────

/** Шаблон уведомления и его параметры для типа изменения (тексты ведёт Claude, DS-32). */
function notificationFor(
  input: ScheduleChangeInput,
  context: {
    courseTitle: string;
    original: StaffClassRow;
    newRoomNumber: string | null;
    newTeacherName: string | null;
  },
): { key: NotifyKey; params: NotifyParams[NotifyKey] } {
  const original = context.original;
  switch (input.type) {
    case "cancelled":
      return {
        key: "schedule_cancelled",
        params: {
          course: context.courseTitle,
          startsAt: original.row.startsAt,
        },
      };
    case "moved":
      return {
        key: "schedule_moved",
        params: {
          course: context.courseTitle,
          from: original.row.startsAt,
          to: input.newStartsAt ?? original.row.startsAt,
          room: original.room.number,
        },
      };
    case "room_changed":
      return {
        key: "schedule_room_changed",
        params: {
          course: context.courseTitle,
          startsAt: original.row.startsAt,
          room: context.newRoomNumber ?? original.room.number,
        },
      };
    case "teacher_changed":
      return {
        key: "schedule_teacher_changed",
        params: {
          course: context.courseTitle,
          startsAt: original.row.startsAt,
          teacher: context.newTeacherName ?? original.teacher.fullName,
        },
      };
  }
}

/** Аудитория уведомления: все студенты группы пары или записанные на курс (потоковая пара). */
function recipientsOf(row: StaffClassRow) {
  return row.row.groupId
    ? { groupIds: [row.row.groupId] }
    : { audience: { courses: [row.course.id] } };
}

/** Момент, к которому относится изменение (для переноса — новое время). */
function effectiveStartsAt(input: ScheduleChangeInput, row: StaffClassRow): Date {
  return input.type === "moved" && input.newStartsAt
    ? new Date(input.newStartsAt)
    : row.row.startsAt;
}

/** DTO только что созданного изменения (формат чтения, seen=false). */
function changeCreatedDTO(change: typeof scheduleChanges.$inferSelect, original: StaffClassRow) {
  return toChangeDTO(
    { change, classId: original.row.id, newRoom: null, newTeacher: null },
    original,
  );
}

/**
 * Создание изменения расписания. Перенос создаётся и поверх существующего изменения
 * (схема не ограничивает пары одной записью). Несуществующая аудитория/преподаватель —
 * 422 VALIDATION (FK снаружи не выпускаем). Результат — ScheduleChangeDTO как у чтения.
 */
export async function createScheduleChange(
  tx: Tx,
  ctx: StaffCtx,
  classId: UUID,
  input: ScheduleChangeInput,
): Promise<ScheduleChangeDTO | null> {
  const row = await findClassForStaff(tx, { facultyId: ctx.facultyId }, classId);
  if (!row) return null;

  let newRoomNumber: string | null = null;
  if (input.type === "room_changed") {
    const [room] = await tx
      .select({ number: rooms.number })
      .from(rooms)
      .where(eq(rooms.id, input.newRoomId ?? classId))
      .limit(1);
    if (!room) throw new HttpError(422, "VALIDATION", { reason: "ROOM_NOT_FOUND" });
    newRoomNumber = room.number;
  }

  let newTeacherName: string | null = null;
  if (input.type === "teacher_changed") {
    const [teacher] = await tx
      .select({ fullName: teachers.fullName })
      .from(teachers)
      .where(eq(teachers.id, input.newTeacherId ?? classId))
      .limit(1);
    if (!teacher) throw new HttpError(422, "VALIDATION", { reason: "TEACHER_NOT_FOUND" });
    newTeacherName = teacher.fullName;
  }

  const at = now();
  const [change] = await tx
    .insert(scheduleChanges)
    .values({
      classId,
      type: input.type,
      newStartsAt: input.type === "moved" ? new Date(input.newStartsAt ?? "") : null,
      newEndsAt: input.type === "moved" ? new Date(input.newEndsAt ?? "") : null,
      newRoomId: input.type === "room_changed" ? (input.newRoomId ?? null) : null,
      newTeacherId: input.type === "teacher_changed" ? (input.newTeacherId ?? null) : null,
      reason: input.reason ?? null,
      createdBy: ctx.userId,
      createdAt: at,
    })
    .returning();

  await audit(tx, "schedule.change", "schedule_change", change.id, {
    classId,
    type: input.type,
  });

  // Класс срочности (DS-32): пара сегодня или завтра — срочное, позже — личное.
  // renderNotification позволяет только понижать класс, поэтому срочное остаётся
  // срочным, а всё «не сегодня-завтра» понижается до personal.
  const classDate = toMskDate(effectiveStartsAt(input, row));
  const today = toMskDate(at);
  const tomorrow = toMskDate(addDaysMsk(at, 1));
  const urgent = classDate === today || classDate === tomorrow;
  const { key, params } = notificationFor(input, {
    courseTitle: row.course.title,
    original: row,
    newRoomNumber,
    newTeacherName,
  });
  const rendered = renderNotification(key, params, urgent ? undefined : "personal");

  await notify(tx, {
    ...recipientsOf(row),
    class: rendered.class,
    category: rendered.category,
    title: rendered.title,
    body: rendered.body,
    link: { kind: "class", id: classId },
  });

  return changeCreatedDTO(change, row);
}
