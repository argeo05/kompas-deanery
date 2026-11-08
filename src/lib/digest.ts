import type { ISODateTime, NotificationClass } from "@/contracts/api";
import { notImplemented } from "./not-implemented";

// DS-02. Слот дайджеста и момент доставки уведомления (SPEC §6.6, AC-6.3). Тесты: tests/unit/digest.test.ts.

export type { NotificationClass };

/** Ближайший слот дайджеста ≥ createdAt (минуты от полуночи МСК); слоты внутри тихих часов пропускаются. */
export function digestSlot(
  createdAt: ISODateTime,
  slotsMinutes: number[],
  quiet: { from: number; to: number },
): ISODateTime {
  return notImplemented("DS-02", createdAt, slotsMinutes, quiet);
}

/** urgent и категории из immediateCategories — сразу (после тихих часов); остальное — в слот дайджеста. */
export function deliveryTime(
  cls: NotificationClass,
  createdAt: ISODateTime,
  prefs: { slots: number[]; quietFrom: number; quietTo: number; immediateCategories: string[] },
  category: string,
): ISODateTime {
  return notImplemented("DS-02", cls, createdAt, prefs, category);
}
