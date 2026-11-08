import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { notifications } from "../../../db/schema";
import { enrollments } from "../../../db/schema/study";
import { studentProfiles } from "../../../db/schema/people";
import type { NotificationCategory } from "@/contracts/api";
import { now } from "../../lib/clock";
import { deliveryTime } from "../../lib/digest";
import type { Tx } from "../db";
import { findDebounceTarget, prefsForUsers } from "../repositories/notification-prefs";

// Сервис notify (DS-18, SPEC §6.6 «Тонкости»): рассчитывает deliverAt по DS-02 для каждого
// получателя; дебаунс по паре (category, link.id) — повторное событие обновляет текст
// существующего непрочитанного уведомления, а не создаёт новое.
// Вызывается внутри withUserTx (студентские источники) или staff-tx (DS-30…33): под RLS
// вставка чужих уведомлений проходит только для сотрудников своей видимости (0001_rls.sql).

export interface NotifyRequest {
  /** Получатели: студенты напрямую, группы или аудитория (достаточно одного источника). */
  studentIds?: string[];
  groupIds?: string[];
  audience?: { facultyIds?: string[]; courses?: string[]; groupIds?: string[] };
  class: "urgent" | "personal" | "info";
  category: NotificationCategory;
  /** Заголовок и текст из renderNotification (тексты ведёт Claude, сервис их только передаёт). */
  title: string;
  body: string;
  link: { kind: string; id: string };
}

/** Студенты аудитории: из списка, групп, факультетов и записей на курсы. */
export async function resolveStudents(tx: Tx, req: NotifyRequest): Promise<string[]> {
  const found = new Set<string>();

  for (const id of req.studentIds ?? []) found.add(id);

  const groupIds = [...new Set([...(req.groupIds ?? []), ...(req.audience?.groupIds ?? [])])];
  if (groupIds.length > 0) {
    const rows = await tx
      .select({ userId: studentProfiles.userId })
      .from(studentProfiles)
      .where(inArray(studentProfiles.groupId, groupIds));
    for (const r of rows) found.add(r.userId);
  }

  const facultyIds = req.audience?.facultyIds ?? [];
  if (facultyIds.length > 0) {
    const rows = await tx
      .select({ userId: studentProfiles.userId })
      .from(studentProfiles)
      .where(inArray(studentProfiles.facultyId, facultyIds));
    for (const r of rows) found.add(r.userId);
  }

  const courseIds = req.audience?.courses ?? [];
  if (courseIds.length > 0) {
    const rows = await tx
      .select({ userId: studentProfiles.userId })
      .from(studentProfiles)
      .innerJoin(enrollments, eq(enrollments.studentId, studentProfiles.userId))
      .where(inArray(enrollments.courseId, courseIds));
    for (const r of rows) found.add(r.userId);
  }

  return [...found];
}

/**
 * Создаёт или обновляет уведомления каждому получателю.
 * Не бросает ошибок по отдельным адресатам: RLS фильтрует, кого не видно.
 */
export async function notify(tx: Tx, req: NotifyRequest): Promise<void> {
  const targets = await resolveStudents(tx, req);
  if (targets.length === 0) return;

  const prefsMap = await prefsForUsers(tx, targets);
  const at = now();

  for (const userId of targets) {
    const prefs = prefsMap.get(userId)!;
    // Выключенные категории получают только срочные (классу urgent выключение недоступно).
    if (req.class !== "urgent" && prefs.disabledCategories.includes(req.category)) continue;

    const deliverAt = deliveryTime(req.class, at.toISOString(), prefs, req.category);

    // Дебаунс: непрочитанное по паре (category, linkId) обновляем текстом, не создаём второе.
    const existingId = await findDebounceTarget(tx, userId, req.category, req.link.id);
    if (existingId) {
      await tx
        .update(notifications)
        .set({ title: req.title, body: req.body, class: req.class })
        .where(and(eq(notifications.id, existingId), eq(notifications.userId, userId)));
      continue;
    }

    await tx.insert(notifications).values({
      userId,
      class: req.class,
      category: req.category,
      title: req.title,
      body: req.body,
      linkKind: req.link.kind as "class",
      linkId: req.link.id,
      createdAt: at,
      deliverAt: new Date(deliverAt),
      readAt: null,
    });
  }
}
