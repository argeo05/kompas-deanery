import "server-only";
import { and, eq } from "drizzle-orm";
import type {
  DeadlineCreateBody,
  DeadlineDTO,
  DeadlineSource,
  DeadlineWindowsDTO,
  DeadlinesDTO,
  PlanCreateBody,
  PlanDTO,
} from "@/contracts/api";
import { now } from "@/lib/clock";
import { toMsk } from "@/lib/time";
import { freeWindows } from "@/lib/windows";
import { deadlines, plans } from "../../../db/schema";
import type { MyScheduleKeys } from "../repositories/schedule";
import { listMyClasses, listMyCourseIds } from "../repositories/schedule";
import type { Tx } from "../db";
import { HttpError, notFound } from "../http";
import {
  findDeadlineForStudent,
  findPlanForStudent,
  findLatestPlanForDeadline,
  listDeadlinesForStudent,
  listPlansForStudent,
} from "../repositories/deadlines";
import type { DeadlinesListQuery } from "../schemas/deadlines";
import { syncDeadlineReminders } from "./deadline-reminders";

// Сервис дедлайнов и планов студента (DS-15, SPEC §6.7):
//   - список собирается из таблицы deadlines; для source = assessment/admin строки
//     уже лежат в deadlines у каждого студента (сид или сервис сотрудников), группировка — сервер;
//   - «горит» (hot) = активный дедлайн со сроком ≤ 48 ч, «На этой неделе» (week) = ≤ 7 дней,
//     остальное — «Позже» (later), отмеченные «Сделал» — «Сделано» (done);
//   - риск = не сделан и осталось ≤ 48 ч (та же граница, что у «горит»);
//   - план «если–то» — только для дедлайна со звёздочкой или с риском, напоминание —
//     на начало выбранного окна с учётом тихих часов.

const HOUR = 3_600_000;
/** Граница «горит» и «риск»: 48 часов от текущего момента. */
export const HOT_MS = 48 * HOUR;
/** Граница группы «На этой неделе»: 7 дней от текущего момента. */
const WEEK_MS = 7 * 24 * HOUR;

export type DeadlineAction = "star" | "unstar" | "done" | "undone";

export type DeadlineRow = Awaited<ReturnType<typeof listDeadlinesForStudent>>[number];

/**
 * Риск (DeadlineDTO.risk): дедлайн ещё не отмечен «Сделал» и до срока ≤ 48 ч
 * (просроченный и не сделанный — тоже риск).
 */
function isRisk(d: { doneAt: Date | null; dueAt: Date }, at: Date): boolean {
  return d.doneAt === null && d.dueAt.getTime() - at.getTime() <= HOT_MS;
}

function toPlanDTO(p: typeof plans.$inferSelect): PlanDTO {
  return {
    id: p.id,
    startsAt: toMsk(p.startsAt),
    endsAt: toMsk(p.endsAt),
    place: p.place,
    firstAction: p.firstAction,
  };
}

/** Актуальный план дедлайна — последний созданный (в schema нет unique по deadlineId). */
export function latestPlans(
  planRows: Awaited<ReturnType<typeof listPlansForStudent>>,
): Map<string, PlanDTO> {
  const map = new Map<string, PlanDTO>();
  for (const p of planRows) {
    if (!map.has(p.deadlineId)) map.set(p.deadlineId, toPlanDTO(p));
  }
  return map;
}

export function toDeadlineDTO(
  row: DeadlineRow,
  planById: Map<string, PlanDTO>,
  at: Date,
): DeadlineDTO {
  const d = row.deadline;
  return {
    id: d.id,
    source: d.source as DeadlineSource,
    title: d.title,
    courseTitle: row.courseTitle ?? null,
    dueAt: toMsk(d.dueAt),
    starred: d.starred,
    done: d.doneAt !== null,
    risk: isRisk(d, at),
    plan: planById.get(d.id) ?? null,
  };
}

/**
 * GET /api/me/deadlines: активные раскладываются по группам «горит / неделя / позже»,
 * сделанные — в «Сделано». status фильтрует вид: active — только активные, done — «Сделано»;
 * без параметра возвращаются все четыре группы.
 */
export async function listMyDeadlines(
  tx: Tx,
  studentId: string,
  q: DeadlinesListQuery,
): Promise<DeadlinesDTO> {
  const [deadlineRows, planRows] = await Promise.all([
    listDeadlinesForStudent(tx, studentId),
    listPlansForStudent(tx, studentId),
  ]);
  const planById = latestPlans(planRows);
  const at = now();

  const hot: DeadlineDTO[] = [];
  const week: DeadlineDTO[] = [];
  const later: DeadlineDTO[] = [];
  const done: DeadlineDTO[] = [];

  for (const row of deadlineRows) {
    const dto = toDeadlineDTO(row, planById, at);
    if (row.deadline.doneAt !== null) done.push(dto);
    else if (row.deadline.dueAt.getTime() - at.getTime() <= HOT_MS) hot.push(dto);
    else if (row.deadline.dueAt.getTime() - at.getTime() <= WEEK_MS) week.push(dto);
    else later.push(dto);
  }

  return {
    groups: {
      hot: q.status === "done" ? [] : hot,
      week: q.status === "done" ? [] : week,
      later: q.status === "done" ? [] : later,
      done: q.status === "active" ? [] : done,
    },
  };
}

/** POST /api/me/deadlines — личный дедлайн студента. */
export async function createMyDeadline(
  tx: Tx,
  studentId: string,
  body: DeadlineCreateBody,
): Promise<DeadlineDTO> {
  const at = now();
  const [row] = await tx
    .insert(deadlines)
    .values({
      studentId,
      source: "personal",
      title: body.title,
      dueAt: new Date(body.dueAt),
      starred: false,
      createdAt: at,
    })
    .returning();
  await syncDeadlineReminders(tx, studentId, at);
  return toDeadlineDTO({ deadline: row, courseTitle: null }, new Map(), at);
}

/** POST /api/me/deadlines/:id/star|unstar|done|undone; null — чужой или несуществующий. */
export async function changeMyDeadline(
  tx: Tx,
  studentId: string,
  deadlineId: string,
  action: DeadlineAction,
): Promise<DeadlineDTO | null> {
  const row = await findDeadlineForStudent(tx, studentId, deadlineId, true);
  if (!row) return null;
  const at = now();
  const values = {
    starred: action === "star" ? true : action === "unstar" ? false : row.deadline.starred,
    doneAt: action === "done" ? at : action === "undone" ? null : row.deadline.doneAt,
  };
  await tx
    .update(deadlines)
    .set(values)
    .where(and(eq(deadlines.id, deadlineId), eq(deadlines.studentId, studentId)));

  if (action === "done" || action === "undone") await syncDeadlineReminders(tx, studentId, at);
  const planById = latestPlans(await listPlansForStudent(tx, studentId));
  return toDeadlineDTO({ ...row, deadline: { ...row.deadline, ...values } }, planById, at);
}

/**
 * GET /api/me/deadlines/:id/windows — 3 ближайших окна без пар (DS-05): 7 дней вперёд,
 * окно ≥ 60 мин, учебный день 09:00–22:00 МСК. null — чужой или несуществующий дедлайн.
 */
export async function findMyDeadlineWindows(
  tx: Tx,
  keys: MyScheduleKeys,
  deadlineId: string,
): Promise<DeadlineWindowsDTO | null> {
  const row = await findDeadlineForStudent(tx, keys.studentId, deadlineId);
  if (!row) return null;

  const at = now();
  const courseIds = await listMyCourseIds(tx, keys);
  const end = new Date(at.getTime() + 7 * 24 * HOUR);
  const classes = await listMyClasses(tx, keys, courseIds, at, end);
  const windows = freeWindows(
    classes.map((c) => ({
      startsAt: toMsk(c.row.startsAt),
      endsAt: toMsk(c.row.endsAt),
    })),
    at.toISOString(),
    7,
  ).slice(0, 3);
  return { windows };
}

/**
 * POST /api/me/plans — план «если–то» к своему дедлайну. Правило SPEC §6.7 п.8:
 * дедлайн должен быть со звёздочкой или в риске — иначе 422 VALIDATION { reason: "NOT_STARRED" }.
 * Замена плана и перенос его напоминания проходят в одной транзакции.
 */
export async function createMyPlan(
  tx: Tx,
  keys: MyScheduleKeys,
  body: PlanCreateBody,
): Promise<PlanDTO> {
  const row = await findDeadlineForStudent(tx, keys.studentId, body.deadlineId, true);
  // В теле чужой или несуществующий deadlineId — тот же 404, что и в пути.
  if (!row) notFound();
  const at = now();
  if (!row.deadline.starred && !isRisk(row.deadline, at)) {
    throw new HttpError(422, "VALIDATION", { reason: "NOT_STARRED" });
  }

  const previous = await findLatestPlanForDeadline(tx, keys.studentId, body.deadlineId);
  const startsAt = new Date(body.startsAt);
  const endsAt = new Date(body.endsAt);
  if (
    previous &&
    previous.startsAt.getTime() === startsAt.getTime() &&
    previous.endsAt.getTime() === endsAt.getTime() &&
    previous.place === body.place &&
    previous.firstAction === body.firstAction
  )
    return toPlanDTO(previous);

  // Даже при одинаковом показании часов последний сохранённый план должен попасть в карточку.
  const createdAt = previous
    ? new Date(Math.max(at.getTime(), previous.createdAt.getTime() + 1))
    : at;
  const [plan] = await tx
    .insert(plans)
    .values({
      studentId: keys.studentId,
      deadlineId: body.deadlineId,
      startsAt,
      endsAt,
      place: body.place,
      firstAction: body.firstAction,
      createdAt,
    })
    .returning();

  await syncDeadlineReminders(tx, keys.studentId, at);
  return toPlanDTO(plan);
}

/** DELETE /api/me/plans/:id — только свой план; null — чужой или несуществующий. */
export async function deleteMyPlan(tx: Tx, studentId: string, planId: string): Promise<boolean> {
  const plan = await findPlanForStudent(tx, studentId, planId);
  if (!plan) return false;
  await findDeadlineForStudent(tx, studentId, plan.deadlineId, true);
  const current = await findLatestPlanForDeadline(tx, studentId, plan.deadlineId);
  // В карточке один план. Отмена текущей версии не должна вернуть прежнее время после переноса.
  // Запрос со старого устройства по прежнему id не затрагивает выбранную позднее версию.
  const target =
    current?.id === planId ? eq(plans.deadlineId, plan.deadlineId) : eq(plans.id, planId);
  const removed = await tx
    .delete(plans)
    .where(and(eq(plans.studentId, studentId), target))
    .returning({ id: plans.id });
  if (!removed.length) return false;
  await syncDeadlineReminders(tx, studentId, now());
  return true;
}
