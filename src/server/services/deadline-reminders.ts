import "server-only";
import { deliveryTime, isQuiet } from "@/lib/digest";
import type { Tx } from "../db";
import { renderNotification } from "../notify-templates";
import { myPrefs } from "../repositories/notification-prefs";
import {
  deleteReminderNotifications,
  listReminderNotifications,
  listReminderSources,
  lockReminderSchedule,
  saveReminderNotifications,
  type ReminderRow,
} from "../repositories/deadline-reminders";

const DAY_MS = 24 * 60 * 60_000;

/** В ленте действует только последний план дедлайна, тот же, который показывается в карточке.
 * Источник определяет UUID напоминания. Так повторное чтение, повторный POST или два устройства
 * не создают новые сообщения. Новые и старые записи обрабатываются одинаково, без фонового задания. */
export async function syncDeadlineReminders(tx: Tx, userId: string, at: Date) {
  await lockReminderSchedule(tx, userId);
  const [sources, prefs] = await Promise.all([
    listReminderSources(tx, userId, at),
    myPrefs(tx, userId),
  ]);
  const existing = await listReminderNotifications(
    tx,
    userId,
    sources.map(({ deadline }) => deadline.id),
    at,
  );
  const desired = new Map<string, ReminderRow>();
  const currentPlans = new Map(
    sources.flatMap(({ deadline, plan }) => (plan ? [[deadline.id, plan] as const] : [])),
  );

  const quiet = { from: prefs.quietFrom, to: prefs.quietTo };
  const canDeliverDeadline =
    !prefs.disabledCategories.includes("deadline") &&
    (prefs.immediateCategories.includes("deadline") ||
      prefs.slots.some((slot) => !isQuiet(slot, quiet)));

  for (const { deadline, plan } of sources) {
    if (deadline.dueAt > at && canDeliverDeadline) {
      // Если студент добавил задачу менее чем за сутки, раньше создания она прийти не может.
      const eventAt = new Date(
        Math.max(deadline.createdAt.getTime(), deadline.dueAt.getTime() - DAY_MS),
      );
      const scheduled = deliveryTime("personal", eventAt.toISOString(), prefs, "deadline");
      const deliverAt = new Date(Math.max(Date.parse(scheduled), eventAt.getTime()));
      if (deliverAt < deadline.dueAt) {
        const message = renderNotification("deadline_24h", {
          title: deadline.title,
          dueAt: deadline.dueAt,
          deliverAt,
        });
        desired.set(deadline.id, {
          id: deadline.id,
          userId,
          ...message,
          linkId: deadline.id,
          createdAt: eventAt,
          deliverAt,
        });
      }
    }
    if (plan && plan.endsAt > at && !prefs.disabledCategories.includes("plan")) {
      // Студент сам выбрал время, поэтому дайджеста не ждём; тихие часы сохраняются.
      const eventAt = new Date(Math.max(plan.startsAt.getTime(), plan.createdAt.getTime()));
      const scheduled = deliveryTime(
        "personal",
        eventAt.toISOString(),
        { ...prefs, immediateCategories: ["plan"] },
        "plan",
      );
      const deliverAt = new Date(Math.max(Date.parse(scheduled), eventAt.getTime()));
      if (deliverAt < plan.endsAt) {
        const message = renderNotification("plan_reminder", {
          title: deadline.title,
          place: plan.place,
          firstAction: plan.firstAction,
          startsAt: plan.startsAt,
        });
        desired.set(plan.id, {
          id: plan.id,
          userId,
          ...message,
          linkId: deadline.id,
          createdAt: plan.createdAt,
          deliverAt,
        });
      }
    }
  }

  const remove: string[] = [];
  for (const row of existing) {
    const next = desired.get(row.id);
    if (next) {
      // Уже пришедшие записи сохраняют время и статус чтения при смене настроек.
      if (
        row.readAt ||
        row.deliverAt <= at ||
        (row.deliverAt.getTime() === next.deliverAt.getTime() &&
          row.title === next.title &&
          row.body === next.body)
      )
        desired.delete(row.id);
      continue;
    }
    // Старое напоминание имело случайный id и могло попасть в ленту до начала плана.
    // Нетронутое преждевременное сообщение заменяем актуальным, прочитанную историю сохраняем.
    const plan = currentPlans.get(row.linkId);
    const earlyLegacy =
      row.category === "plan" &&
      plan &&
      row.id !== plan.id &&
      row.createdAt >= plan.createdAt &&
      row.deliverAt < plan.startsAt;
    if (!row.readAt && (row.deliverAt > at || earlyLegacy)) remove.push(row.id);
  }
  await deleteReminderNotifications(tx, userId, remove);
  await saveReminderNotifications(tx, userId, [...desired.values()]);
}
