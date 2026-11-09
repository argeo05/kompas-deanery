import type { Delivery, RejectReason, RequestDTO, RequestStatus } from "@/contracts/api";

// Тексты статусов заявки для студента (SPEC §6.5, таблица «Статусы»; тон — §7.6).

/** Полная формулировка статуса: «Отправлена · ждёт сотрудника». assignee — «Елена С.». */
export function statusLine(
  status: RequestStatus,
  delivery: Delivery | null,
  assignee?: string | null,
): string {
  switch (status) {
    case "submitted":
      return "Отправлена · ждёт сотрудника";
    case "in_progress":
      return assignee ? `В работе · ${assignee} готовит` : "В работе";
    case "needs_info":
      return "Нужно уточнение";
    case "ready":
      return delivery === "original" ? "Готова · можно забрать" : "Готова · можно скачать";
    case "issued":
      return "Выдана";
    case "rejected":
      return "Отклонена";
    case "cancelled":
      return "Отменена вами";
  }
}

/** Короткая подпись бейджа в списке (с уточнением для готовых). */
export function badgeLabel(r: Pick<RequestDTO, "status" | "delivery">): string | undefined {
  if (r.status === "ready")
    return r.delivery === "original" ? "Готова · забрать" : "Готова · скачать";
  return undefined;
}

export const REJECT_REASON_TEXT: Record<RejectReason, string> = {
  INCOMPLETE: "Не хватило данных",
  NOT_ELIGIBLE: "Выдать нельзя: нет оснований",
  DUPLICATE: "Такая заявка уже есть",
  OTHER: "Другая причина",
};

export const DELIVERY_TEXT: Record<Delivery, string> = {
  electronic: "Электронно (PDF)",
  original: "Бумажный оригинал в студенческом офисе",
};

/** Этапы трекера в порядке движения заявки (SPEC §6.5 п.5). */
export function eventTitle(from: RequestStatus | null, to: RequestStatus): string {
  switch (to) {
    case "submitted":
      return "Отправлена";
    case "in_progress":
      return from === "needs_info" ? "Вы ответили, заявка снова в работе" : "Принята в работу";
    case "needs_info":
      return "Нужно уточнение";
    case "ready":
      return "Готова";
    case "issued":
      return "Выдана";
    case "rejected":
      return "Отклонена";
    case "cancelled":
      return "Отменена вами";
  }
}
