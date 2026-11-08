import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, gte, lt, notInArray, sql } from "drizzle-orm";
import * as s from "@db/schema";
import { now } from "@/lib/clock";
import { formatRequestNumber } from "@/lib/request-number";
import { addDaysMsk, startOfDayMsk, toMskDate } from "@/lib/time";
import { getDb } from "@/server/db";
import type { RequestStatus } from "@/contracts/api";
import type { Fixtures } from "../helpers/fixtures";

// Фабрики фикстур матрицы изоляции. Пишут владельцем БД (RLS не действует).
// Каждый вызов создаёт СВЕЖИЙ ресурс Ани: изменяющие проверки (отмена, удаление, архив)
// не зависят друг от друга и от порядка тестов. Ресурсы Ани — экономфак, группа Б-ЭК-101;
// Максим (медиа) и Олег (деканат МО) должны получать 404 или не видеть их в списках.

const db = () => getDb();
const HOUR = 3_600_000;
const later = (hours: number) => new Date(now().getTime() + hours * HOUR);

async function annaProfile(fx: Fixtures) {
  const [p] = await db()
    .select()
    .from(s.studentProfiles)
    .where(eq(s.studentProfiles.userId, fx.users.anna));
  return p;
}

async function officeUnitId(fx: Fixtures): Promise<string> {
  const [p] = await db()
    .select({ unitId: s.staffProfiles.unitId })
    .from(s.staffProfiles)
    .where(eq(s.staffProfiles.userId, fx.users.elena));
  return p.unitId;
}

/** Новая пара группы Ани через 2 дня — по образцу существующей (курс, аудитория, преподаватель). */
export async function annaClass(fx: Fixtures): Promise<string> {
  const { groupId } = await annaProfile(fx);
  const [tpl] = await db().select().from(s.classes).where(eq(s.classes.groupId, groupId)).limit(1);
  const startsAt = later(48);
  const [row] = await db()
    .insert(s.classes)
    .values({
      courseId: tpl.courseId,
      groupId,
      type: tpl.type,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 90 * 60_000),
      roomId: tpl.roomId,
      teacherId: tpl.teacherId,
      weekParity: tpl.weekParity,
    })
    .returning({ id: s.classes.id });
  return row.id;
}

/** Пары группы Ани за дни [from, to] по Москве. */
export async function annaClassesBetween(fx: Fixtures, from: string, to: string) {
  const { groupId } = await annaProfile(fx);
  const rows = await db()
    .select({ id: s.classes.id })
    .from(s.classes)
    .where(
      and(
        eq(s.classes.groupId, groupId),
        gte(s.classes.startsAt, startOfDayMsk(from)),
        lt(s.classes.startsAt, addDaysMsk(startOfDayMsk(to), 1)),
      ),
    );
  return rows.map((r) => r.id);
}

/** Ближайший день с парами группы Ани (начиная с сегодня) и id этих пар. */
export async function annaStudyDay(fx: Fixtures): Promise<{ date: string; classIds: string[] }> {
  const { groupId } = await annaProfile(fx);
  const [first] = await db()
    .select({ startsAt: s.classes.startsAt })
    .from(s.classes)
    .where(and(eq(s.classes.groupId, groupId), gte(s.classes.startsAt, startOfDayMsk())))
    .orderBy(asc(s.classes.startsAt))
    .limit(1);
  const date = toMskDate(first.startsAt);
  return { date, classIds: await annaClassesBetween(fx, date, date) };
}

/** Изменение расписания у пары группы Ани (демо-перенос из сида). */
export async function annaScheduleChange(fx: Fixtures): Promise<string> {
  const { groupId } = await annaProfile(fx);
  const [row] = await db()
    .select({ id: s.scheduleChanges.id })
    .from(s.scheduleChanges)
    .innerJoin(s.classes, eq(s.classes.id, s.scheduleChanges.classId))
    .where(eq(s.classes.groupId, groupId))
    .limit(1);
  return row.id;
}

/** Дисциплины Ани, на которые Максим не записан. */
export async function annaOnlyCourses(fx: Fixtures): Promise<string[]> {
  const maxims = db()
    .select({ id: s.enrollments.courseId })
    .from(s.enrollments)
    .where(eq(s.enrollments.studentId, fx.users.maxim));
  const rows = await db()
    .select({ id: s.enrollments.courseId })
    .from(s.enrollments)
    .where(
      and(eq(s.enrollments.studentId, fx.users.anna), notInArray(s.enrollments.courseId, maxims)),
    );
  return rows.map((r) => r.id);
}

export async function annaDeadline(fx: Fixtures, opts: { starred?: boolean } = {}) {
  const [row] = await db()
    .insert(s.deadlines)
    .values({
      studentId: fx.users.anna,
      source: "personal",
      title: "Фикстура матрицы изоляции",
      dueAt: later(72),
      starred: opts.starred ?? false,
      createdAt: now(),
    })
    .returning({ id: s.deadlines.id });
  return row.id;
}

export async function annaPlan(fx: Fixtures) {
  const deadlineId = await annaDeadline(fx, { starred: true });
  const [row] = await db()
    .insert(s.plans)
    .values({
      studentId: fx.users.anna,
      deadlineId,
      startsAt: later(24),
      endsAt: later(25),
      place: "Библиотека",
      firstAction: "Открыть черновик",
      createdAt: now(),
    })
    .returning({ id: s.plans.id });
  return row.id;
}

/**
 * Заявка Ани в нужном статусе. Срок по умолчанию — в прошлом: такая заявка первой
 * попадает в очередь сотрудника при сортировке по сроку, даже когда заявок больше страницы.
 */
export async function annaRequest(
  fx: Fixtures,
  status: RequestStatus,
  dueAt: Date = later(-24 * 30),
) {
  const createdAt = now();
  const [{ seq }] = await db().execute<{ seq: string }>(
    sql`SELECT nextval('request_number_seq') AS seq`,
  );
  const [row] = await db()
    .insert(s.requests)
    .values({
      number: formatRequestNumber(createdAt, Number(seq)),
      studentId: fx.users.anna,
      typeCode: "study_cert",
      status,
      payload: {},
      delivery: "electronic",
      copies: 1,
      createdAt,
      dueAt,
      updatedAt: createdAt,
      studentSeenAt: createdAt,
      assigneeId: status === "submitted" ? null : fx.users.elena,
      rejectReason: status === "rejected" ? "INCOMPLETE" : null,
    })
    .returning({ id: s.requests.id });
  await db().insert(s.requestEvents).values({
    requestId: row.id,
    fromStatus: null,
    toStatus: "submitted",
    actorId: fx.users.anna,
    createdAt,
  });
  if (status !== "submitted") {
    await db().insert(s.requestEvents).values({
      requestId: row.id,
      fromStatus: "submitted",
      toStatus: status,
      actorId: fx.users.elena,
      createdAt,
    });
  }
  return row.id;
}

export async function annaDocument(fx: Fixtures) {
  const requestId = await annaRequest(fx, "issued");
  const [row] = await db()
    .insert(s.documents)
    .values({
      requestId,
      studentId: fx.users.anna,
      fileKey: `test/${randomUUID()}.pdf`,
      verifyTokenHash: randomBytes(32).toString("hex"),
      issuedAt: now(),
    })
    .returning({ id: s.documents.id });
  return row.id;
}

export async function annaTicket(fx: Fixtures) {
  const createdAt = now();
  const [row] = await db()
    .insert(s.tickets)
    .values({
      studentId: fx.users.anna,
      topic: "requests",
      status: "open",
      createdAt,
      lastMessageAt: createdAt,
    })
    .returning({ id: s.tickets.id });
  await db()
    .insert(s.ticketMessages)
    .values({ ticketId: row.id, authorId: fx.users.anna, body: "Фикстура", createdAt });
  return row.id;
}

/** Доставленное уведомление Ани (deliverAt в прошлом), самое свежее в ленте. */
export async function annaNotification(fx: Fixtures) {
  const at = later(-0.01);
  const [row] = await db()
    .insert(s.notifications)
    .values({
      userId: fx.users.anna,
      class: "personal",
      category: "request",
      title: "Фикстура",
      body: "Фикстура",
      linkKind: "request",
      linkId: randomUUID(),
      createdAt: at,
      deliverAt: at,
    })
    .returning({ id: s.notifications.id });
  return row.id;
}

/** Объявление студенческого офиса (подразделение Елены) только для группы Ани, уже опубликовано. */
export async function annaGroupAnnouncement(fx: Fixtures) {
  const { groupId } = await annaProfile(fx);
  const [row] = await db()
    .insert(s.announcements)
    .values({
      authorUnitId: await officeUnitId(fx),
      createdBy: fx.users.elena,
      title: "Фикстура матрицы изоляции",
      bodyMd: "Текст",
      audience: { groupIds: [groupId] },
      important: false,
      publishAt: later(-0.01),
      createdAt: later(-0.01),
    })
    .returning({ id: s.announcements.id });
  return row.id;
}

export async function annaGroupId(fx: Fixtures) {
  return (await annaProfile(fx)).groupId;
}

/** Будущие сутки по Москве: [через 1 день 10:00, +1 ч], до срока annaDeadline(). */
export function planWindow() {
  const day = addDaysMsk(startOfDayMsk(), 1);
  return {
    startsAt: new Date(day.getTime() + 10 * HOUR).toISOString(),
    endsAt: new Date(day.getTime() + 11 * HOUR).toISOString(),
  };
}

export const todayMsk = () => toMskDate(now());
export const isoIn = (hours: number) => later(hours).toISOString();
