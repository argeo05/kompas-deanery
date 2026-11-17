import type { NotificationLinkKind } from "@/contracts/api";

// Куда ведёт уведомление (SPEC §6.6 п.2, AC-6.5). Единая карта для центра уведомлений,
// «Сегодня» и поиска: каждый вид цели — существующая страница студента.
export function linkHref(kind: NotificationLinkKind, id: string): string {
  switch (kind) {
    case "class":
      return `/schedule?class=${id}`;
    case "request":
      return `/requests/${id}`;
    case "course":
      return `/study/subjects/${id}`;
    case "deadline":
      return `/study/deadlines#d-${id}`;
    case "announcement":
      return `/notifications?tab=announcements#a-${id}`;
    case "ticket":
      return `/support/${id}`;
  }
}

/** Подпись действия на кнопке уведомления (SPEC §6.6 п.2: каждое уведомление ведёт к действию). */
export function linkActionLabel(kind: NotificationLinkKind): string {
  switch (kind) {
    case "class":
      return "Открыть пару";
    case "request":
      return "Открыть заявку";
    case "course":
      return "Открыть дисциплину";
    case "deadline":
      return "Запланировать";
    case "announcement":
      return "Читать объявление";
    case "ticket":
      return "Открыть обращение";
  }
}
