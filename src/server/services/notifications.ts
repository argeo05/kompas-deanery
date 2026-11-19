import "server-only";
import {
  listNotifications,
  markNotificationsRead,
  toNotificationDTO,
  unreadCounts,
  type ListCursor,
} from "../repositories/notifications";
import { myPrefs, saveMyPrefs } from "../repositories/notification-prefs";
import type { NotificationCategory, NotificationPrefsDTO, NotificationsDTO } from "@/contracts/api";
import type { Tx } from "../db";
import { now } from "../../lib/clock";
import type {
  NotificationPrefsBody,
  NotificationsListQuery,
  NotificationsReadBody,
} from "../schemas/notifications";
import { HttpError } from "../http";
import { syncDeadlineReminders } from "./deadline-reminders";

// Сервис уведомлений студента (DS-18): список с курсорной пагинацией, чтение, настройки.

function encodeCursor(cursor: ListCursor): string {
  return Buffer.from(`${cursor.deliverAt.toISOString()}|${cursor.id}`).toString("base64url");
}

function decodeCursor(raw: string): ListCursor {
  const [iso, id] = Buffer.from(raw, "base64url").toString("utf8").split("|");
  const deliverAt = new Date(iso ?? "");
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id ?? "");
  if (Number.isNaN(deliverAt.getTime()) || !isUuid) {
    throw new HttpError(422, "VALIDATION", {
      issues: [{ path: "cursor", code: "invalid_cursor" }],
    });
  }
  return { deliverAt, id };
}

export async function listMyNotifications(
  tx: Tx,
  userId: string,
  q: NotificationsListQuery,
): Promise<NotificationsDTO> {
  const at = now();
  const cursor = q.cursor ? decodeCursor(q.cursor) : null;
  await syncDeadlineReminders(tx, userId, at);
  const rows = await listNotifications(tx, userId, {
    tab: q.tab,
    cursor,
    limit: q.limit,
    now: at,
  });
  const page = rows.slice(0, q.limit);
  const last = page.at(-1);
  const unread = await unreadCounts(tx, userId, at);
  return {
    items: page.map(toNotificationDTO),
    nextCursor:
      rows.length > q.limit && last
        ? encodeCursor({ deliverAt: last.deliverAt, id: last.id })
        : null,
    unread,
  };
}

export async function readMyNotifications(
  tx: Tx,
  userId: string,
  body: NotificationsReadBody,
): Promise<void> {
  const at = now();
  const read = "all" in body ? { all: true } : { all: false, ids: body.ids };
  await syncDeadlineReminders(tx, userId, at);
  await markNotificationsRead(tx, userId, read, at);
}

/** GET settings. preset из БД: если строка есть — её preset, иначе default. */
export async function getMyPrefsDTO(tx: Tx, userId: string): Promise<NotificationPrefsDTO> {
  const prefs = await myPrefs(tx, userId);
  return {
    slots: prefs.slots,
    preset: "default",
    quietFrom: prefs.quietFrom,
    quietTo: prefs.quietTo,
    immediateCategories: prefs.immediateCategories as NotificationCategory[],
    disabledCategories: prefs.disabledCategories as NotificationCategory[],
  };
}

/** PUT settings: сохраняет и возвращает актуальные. */
export async function saveMyPrefsDTO(
  tx: Tx,
  userId: string,
  body: NotificationPrefsBody,
): Promise<NotificationPrefsDTO> {
  await saveMyPrefs(tx, userId, body);
  await syncDeadlineReminders(tx, userId, now());
  return {
    slots: body.slots,
    preset: body.preset,
    quietFrom: body.quietFrom,
    quietTo: body.quietTo,
    immediateCategories: body.immediateCategories as NotificationCategory[],
    disabledCategories: body.disabledCategories as NotificationCategory[],
  };
}
