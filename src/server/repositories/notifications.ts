import "server-only";
import { and, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { notifications } from "../../../db/schema";
import type {
  NotificationCategory,
  NotificationClass,
  NotificationDTO,
  NotificationLinkKind,
  UUID,
} from "@/contracts/api";
import { toMsk } from "../../lib/time";
import type { Tx } from "../db";

// Репозиторий списка уведомлений (DS-18). Все запросы с eq(user_id) внутри withUserTx.
// Отдаются только уведомления с deliverAt ≤ now() — дайджест «копится» (SPEC §6.6).

export interface ListCursor {
  deliverAt: Date;
  id: string;
}

export function toNotificationDTO(row: NotificationsRow): NotificationDTO {
  return {
    id: row.id,
    class: row.class,
    category: row.category,
    title: row.title,
    body: row.body,
    link: { kind: row.linkKind, id: row.linkId },
    createdAt: toMsk(row.createdAt),
    deliverAt: toMsk(row.deliverAt),
    readAt: row.readAt ? toMsk(row.readAt) : null,
  };
}

export interface NotificationsRow {
  id: string;
  class: NotificationClass;
  category: NotificationCategory;
  title: string;
  body: string;
  linkKind: NotificationLinkKind;
  linkId: string;
  createdAt: Date;
  deliverAt: Date;
  readAt: Date | null;
}

/** Страница уведомлений (deliver_at ≤ now), новые первыми; fetch limit+1. */
export async function listNotifications(
  tx: Tx,
  userId: string,
  opts: {
    tab: "all" | "important" | "announcements";
    cursor: ListCursor | null;
    limit: number;
    now: Date;
  },
): Promise<NotificationsRow[]> {
  // Отдаётся только «прибывшее»; лента по deliverAt DESC.
  const cmd = and(
    eq(notifications.userId, userId),
    lte(notifications.deliverAt, opts.now),
    opts.tab === "announcements" ? eq(notifications.category, "announcement") : undefined,
    opts.tab === "important" ? sql`${notifications.class} IN ('urgent', 'personal')` : undefined,
    opts.cursor
      ? sql`(${notifications.deliverAt}, ${notifications.id}) < (${opts.cursor.deliverAt.toISOString()}::timestamptz, ${opts.cursor.id}::uuid)`
      : undefined,
  );
  return tx
    .select({
      id: notifications.id,
      class: notifications.class,
      category: notifications.category,
      title: notifications.title,
      body: notifications.body,
      linkKind: notifications.linkKind,
      linkId: notifications.linkId,
      createdAt: notifications.createdAt,
      deliverAt: notifications.deliverAt,
      readAt: notifications.readAt,
    })
    .from(notifications)
    .where(cmd)
    .orderBy(desc(notifications.deliverAt), desc(notifications.id))
    .limit(opts.limit + 1);
}

/** Непрочитанные по классам: { urgent, personal, info }. */
export async function unreadCounts(
  tx: Tx,
  userId: string,
  at: Date,
): Promise<{ urgent: number; personal: number; info: number }> {
  const rows = await tx
    .select({ cls: notifications.class, n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        lte(notifications.deliverAt, at),
      ),
    )
    .groupBy(notifications.class);
  const counts = { urgent: 0, personal: 0, info: 0 };
  for (const r of rows) counts[r.cls] = Number(r.n) ?? counts[r.cls];
  return counts;
}

/** Отметить прочитанными: ids или все назначенные. Возвращает, сколько обновили. */
export async function markNotificationsRead(
  tx: Tx,
  userId: string,
  read: { all: boolean; ids?: UUID[] },
  at: Date,
): Promise<void> {
  if (read.all) {
    await tx
      .update(notifications)
      .set({ readAt: at })
      .where(
        and(
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
          lte(notifications.deliverAt, at),
        ),
      );
    return;
  }
  const ids = read.ids ?? [];
  if (ids.length === 0) return;
  await tx
    .update(notifications)
    .set({ readAt: at })
    .where(
      and(
        eq(notifications.userId, userId),
        inArray(notifications.id, ids),
        lte(notifications.deliverAt, at),
        isNull(notifications.readAt),
      ),
    );
}
