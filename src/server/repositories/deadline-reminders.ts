import "server-only";
import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { deadlines, notifications, plans } from "../../../db/schema";
import type { Tx } from "../db";

export async function lockReminderSchedule(tx: Tx, userId: string) {
  // Два запроса ленты или изменение плана могут прийти одновременно с разных устройств.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}::text, 82603))`);
}

export function listReminderSources(tx: Tx, userId: string, at: Date) {
  const latest = tx
    .selectDistinctOn([plans.deadlineId])
    .from(plans)
    .where(eq(plans.studentId, userId))
    .orderBy(plans.deadlineId, desc(plans.createdAt), desc(plans.id))
    .as("latest_plan");
  return tx
    .select({
      deadline: deadlines,
      plan: {
        id: latest.id,
        startsAt: latest.startsAt,
        endsAt: latest.endsAt,
        createdAt: latest.createdAt,
        place: latest.place,
        firstAction: latest.firstAction,
      },
    })
    .from(deadlines)
    .leftJoin(latest, eq(latest.deadlineId, deadlines.id))
    .where(
      and(
        eq(deadlines.studentId, userId),
        isNull(deadlines.doneAt),
        or(gt(deadlines.dueAt, at), gt(latest.endsAt, at)),
      ),
    );
}

export function listReminderNotifications(tx: Tx, userId: string, deadlineIds: string[], at: Date) {
  return tx
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.linkKind, "deadline"),
        inArray(notifications.category, ["plan", "deadline"]),
        or(gt(notifications.deliverAt, at), inArray(notifications.linkId, deadlineIds)),
      ),
    );
}

export async function deleteReminderNotifications(tx: Tx, userId: string, ids: string[]) {
  if (ids.length)
    await tx
      .delete(notifications)
      .where(and(eq(notifications.userId, userId), inArray(notifications.id, ids)));
}

export type ReminderRow = typeof notifications.$inferInsert & { id: string };

export async function saveReminderNotifications(tx: Tx, userId: string, rows: ReminderRow[]) {
  if (rows.length)
    await tx
      .insert(notifications)
      .values(rows)
      .onConflictDoUpdate({
        target: notifications.id,
        set: {
          deliverAt: sql`excluded.deliver_at`,
          title: sql`excluded.title`,
          body: sql`excluded.body`,
        },
        setWhere: and(eq(notifications.userId, userId), isNull(notifications.readAt)),
      });
}
