import type {
  NotificationCategory,
  NotificationClass,
  NotificationLinkKind,
} from "@/contracts/api";
import { mskParts, toMskDate } from "@/lib/time";

// Шаблоны уведомлений (SPEC §6.6). Файл ведёт Claude: это тексты для людей, а DeepSeek их
// не пишет (DEEPSEEK-TASKS §3 п.11). Сервисы DS-17, DS-18, DS-30, DS-32 и сид только вызывают
// renderNotification(key, params) и сохраняют результат в notifications.
//
// Заглушка: ключи, классы, категории и параметры зафиксированы; тексты черновые.
// TODO(Claude, фаза C): финальная редактура текстов субагентом ux-copy-editor (SPEC §7.6).
// Правило SPEC §6.6: текст самодостаточен — «Макроэкономика 12.11: перенос 12:40 → 15:20, ауд. 4012».

/** Параметры каждого шаблона. Время — момент (Date или ISODateTime), форматируется по Москве. */
export interface NotifyParams {
  /** Перенос пары. Срочное, если пара сегодня или завтра; иначе личное (решает сервис). */
  schedule_moved: { course: string; from: Date | string; to: Date | string; room: string };
  schedule_cancelled: { course: string; startsAt: Date | string };
  schedule_room_changed: { course: string; startsAt: Date | string; room: string };
  schedule_teacher_changed: { course: string; startsAt: Date | string; teacher: string };
  schedule_added: { course: string; startsAt: Date | string; room: string };
  request_taken: { requestTitle: string; number: string };
  request_needs_info: { requestTitle: string; number: string };
  request_message: { requestTitle: string; number: string };
  request_ready: { requestTitle: string; number: string; electronic: boolean };
  request_issued: { requestTitle: string; number: string };
  request_rejected: { requestTitle: string; number: string };
  grade_posted: { course: string; item: string; score: number; max: number };
  grade_changed: {
    course: string;
    item: string;
    oldScore: number | null;
    newScore: number;
    max: number;
  };
  deadline_24h: { title: string; dueAt: Date | string; deliverAt: Date | string };
  plan_reminder: { title: string; place: string; firstAction: string; startsAt: Date | string };
  announcement: { title: string };
  announcement_important: { title: string };
  ticket_answered: { topic: string };
}

export type NotifyKey = keyof NotifyParams;

export interface RenderedNotification {
  class: NotificationClass;
  category: NotificationCategory;
  linkKind: NotificationLinkKind;
  title: string;
  body: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** «12.11» по Москве. */
const dayMonth = (at: Date | string) => {
  const p = mskParts(at);
  return `${pad(p.day)}.${pad(p.month)}`;
};
/** «12:40» по Москве. */
const hm = (at: Date | string) => {
  const p = mskParts(at);
  return `${pad(p.hour)}:${pad(p.minute)}`;
};
const score = (n: number) => String(n).replace(".", ",");

type Template<K extends NotifyKey> = {
  class: NotificationClass;
  category: NotificationCategory;
  linkKind: NotificationLinkKind;
  render: (p: NotifyParams[K]) => { title: string; body: string };
};

const TEMPLATES: { [K in NotifyKey]: Template<K> } = {
  schedule_moved: {
    class: "urgent",
    category: "schedule",
    linkKind: "class",
    render: (p) => ({
      title: "Пара перенесена",
      body: `${p.course} ${dayMonth(p.from)}: перенос ${hm(p.from)} → ${dayMonth(p.to) === dayMonth(p.from) ? "" : `${dayMonth(p.to)} `}${hm(p.to)}, ауд. ${p.room}`,
    }),
  },
  schedule_cancelled: {
    class: "urgent",
    category: "schedule",
    linkKind: "class",
    render: (p) => ({
      title: "Пара отменена",
      body: `${p.course} ${dayMonth(p.startsAt)} в ${hm(p.startsAt)} не состоится`,
    }),
  },
  schedule_room_changed: {
    class: "urgent",
    category: "schedule",
    linkKind: "class",
    render: (p) => ({
      title: "Другая аудитория",
      body: `${p.course} ${dayMonth(p.startsAt)} в ${hm(p.startsAt)}: ауд. ${p.room}`,
    }),
  },
  schedule_teacher_changed: {
    class: "personal",
    category: "schedule",
    linkKind: "class",
    render: (p) => ({
      title: "Замена преподавателя",
      body: `${p.course} ${dayMonth(p.startsAt)} в ${hm(p.startsAt)} ведёт ${p.teacher}`,
    }),
  },
  schedule_added: {
    class: "personal",
    category: "schedule",
    linkKind: "class",
    render: (p) => ({
      title: "Новое занятие",
      body: `${p.course} ${dayMonth(p.startsAt)} в ${hm(p.startsAt)}, ауд. ${p.room}`,
    }),
  },
  request_taken: {
    class: "personal",
    category: "request",
    linkKind: "request",
    render: (p) => ({ title: "Заявка в работе", body: `${p.requestTitle}, ${p.number}` }),
  },
  request_needs_info: {
    class: "urgent",
    category: "request",
    linkKind: "request",
    render: (p) => ({
      title: "Нужно уточнение по заявке",
      body: `${p.requestTitle}, ${p.number}: ответьте в карточке заявки`,
    }),
  },
  request_message: {
    class: "personal",
    category: "request",
    linkKind: "request",
    render: (p) => ({ title: "Новое сообщение по заявке", body: `${p.requestTitle}, ${p.number}` }),
  },
  request_ready: {
    class: "personal",
    category: "request",
    linkKind: "request",
    render: (p) => ({
      title: "Справка готова",
      body: p.electronic
        ? `${p.requestTitle}, ${p.number}: можно скачать`
        : `${p.requestTitle}, ${p.number}: можно забрать`,
    }),
  },
  request_issued: {
    class: "personal",
    category: "request",
    linkKind: "request",
    render: (p) => ({ title: "Справка выдана", body: `${p.requestTitle}, ${p.number}` }),
  },
  request_rejected: {
    class: "personal",
    category: "request",
    linkKind: "request",
    render: (p) => ({
      title: "Заявка отклонена",
      body: `${p.requestTitle}, ${p.number}: в карточке — что исправить`,
    }),
  },
  grade_posted: {
    class: "personal",
    category: "grade",
    linkKind: "course",
    render: (p) => ({
      title: "Новая оценка",
      body: `${p.course}, ${p.item}: ${score(p.score)} из ${score(p.max)}`,
    }),
  },
  grade_changed: {
    class: "personal",
    category: "grade",
    linkKind: "course",
    render: (p) => ({
      title: "Оценка изменена",
      body: `${p.course}, ${p.item}: ${p.oldScore === null ? "—" : score(p.oldScore)} → ${score(p.newScore)} из ${score(p.max)}`,
    }),
  },
  deadline_24h: {
    class: "personal",
    category: "deadline",
    linkKind: "deadline",
    render: (p) => ({
      title: toMskDate(p.dueAt) === toMskDate(p.deliverAt) ? "Дедлайн сегодня" : "Дедлайн завтра",
      body: `${p.title}: до ${dayMonth(p.dueAt)}, ${hm(p.dueAt)}`,
    }),
  },
  plan_reminder: {
    class: "personal",
    category: "plan",
    linkKind: "deadline",
    render: (p) => ({
      title: "Время для плана",
      body: `${p.title}. ${dayMonth(p.startsAt)} в ${hm(p.startsAt)}, ${p.place}: ${p.firstAction}`,
    }),
  },
  announcement: {
    class: "info",
    category: "announcement",
    linkKind: "announcement",
    render: (p) => ({ title: "Объявление", body: p.title }),
  },
  announcement_important: {
    class: "urgent",
    category: "announcement",
    linkKind: "announcement",
    render: (p) => ({ title: "Важное объявление", body: p.title }),
  },
  ticket_answered: {
    class: "personal",
    category: "ticket",
    linkKind: "ticket",
    render: (p) => ({ title: "Ответ на обращение", body: `Тема: ${p.topic}` }),
  },
};

/** Ключи шаблонов — для тестов и для проверки полноты. */
export const NOTIFY_KEYS = Object.keys(TEMPLATES) as NotifyKey[];

/**
 * Текст и классификация уведомления. Класс можно понизить (перенос не на сегодня/завтра —
 * personal), передав overrideClass; повысить личное до срочного нельзя без решения Claude.
 */
export function renderNotification<K extends NotifyKey>(
  key: K,
  params: NotifyParams[K],
  overrideClass?: Exclude<NotificationClass, "urgent">,
): RenderedNotification {
  const t = TEMPLATES[key] as Template<K>;
  return {
    class: overrideClass ?? t.class,
    category: t.category,
    linkKind: t.linkKind,
    ...t.render(params),
  };
}
