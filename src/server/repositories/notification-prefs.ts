import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { notificationPrefs, notifications } from "../../../db/schema";
import type { NotificationCategory } from "@/contracts/api";
import type { Tx } from "../db";

// Репозиторий настроек уведомлений (DS-18). Все запросы с условием по владельцу (userId).
// Отсутствующая строка — настройки по умолчанию (схеме таблицы).

export interface NotifyPrefs {
  slots: number[];
  quietFrom: number;
  quietTo: number;
  immediateCategories: string[];
  disabledCategories: string[];
}

/** Дефолт равен дефолтам таблицы (db/schema/communication.ts). */
export const DEFAULT_PREFS: NotifyPrefs = {
  slots: [480, 780, 1140],
  quietFrom: 1380,
  quietTo: 420,
  immediateCategories: [],
  disabledCategories: [],
};

/** Настройки одного студента; нет строки — дефолт. */
export async function myPrefs(tx: Tx, userId: string): Promise<NotifyPrefs> {
  const [row] = await tx
    .select({
      slots: notificationPrefs.slots,
      quietFrom: notificationPrefs.quietFrom,
      quietTo: notificationPrefs.quietTo,
      immediateCategories: notificationPrefs.immediateCategories,
      disabledCategories: notificationPrefs.disabledCategories,
    })
    .from(notificationPrefs)
    .where(eq(notificationPrefs.userId, userId))
    .limit(1);
  return row ?? DEFAULT_PREFS;
}

/** Настройки нескольких студентов (для notify): значимые срок wait — по дефолту, если строки нет. */
export async function prefsForUsers(tx: Tx, userIds: string[]): Promise<Map<string, NotifyPrefs>> {
  const map = new Map<string, NotifyPrefs>();
  if (userIds.length === 0) return map;
  const rows = await tx
    .select({
      userId: notificationPrefs.userId,
      slots: notificationPrefs.slots,
      quietFrom: notificationPrefs.quietFrom,
      quietTo: notificationPrefs.quietTo,
      immediateCategories: notificationPrefs.immediateCategories,
      disabledCategories: notificationPrefs.disabledCategories,
    })
    .from(notificationPrefs)
    .where(inArray(notificationPrefs.userId, userIds));
  for (const u of userIds) map.set(u, DEFAULT_PREFS);
  for (const r of rows) {
    map.set(r.userId, {
      slots: r.slots,
      quietFrom: r.quietFrom,
      quietTo: r.quietTo,
      immediateCategories: r.immediateCategories,
      disabledCategories: r.disabledCategories,
    });
  }
  return map;
}

/** Сохранить (upsert) настройки студента. */
export async function saveMyPrefs(
  tx: Tx,
  userId: string,
  prefs: {
    slots: number[];
    preset: "default" | "evening" | "custom";
    quietFrom: number;
    quietTo: number;
    immediateCategories: string[];
    disabledCategories: string[];
  },
): Promise<void> {
  await tx
    .insert(notificationPrefs)
    .values({ userId, ...prefs })
    .onConflictDoUpdate({
      target: notificationPrefs.userId,
      set: {
        slots: prefs.slots,
        preset: prefs.preset,
        quietFrom: prefs.quietFrom,
        quietTo: prefs.quietTo,
        immediateCategories: prefs.immediateCategories,
        disabledCategories: prefs.disabledCategories,
        updatedAt: sql`now()`,
      },
    });
}

/** Есть ли непрочитанное уведомление по паре (category, linkId) — для дебаунса. */
export async function findDebounceTarget(
  tx: Tx,
  userId: string,
  category: NotificationCategory,
  linkId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.category, category),
        eq(notifications.linkId, linkId),
        isNull(notifications.readAt),
      ),
    )
    .orderBy(asc(notifications.createdAt))
    .limit(1);
  return row?.id ?? null;
}
