import {
  Bell,
  CalendarClock,
  CalendarDays,
  FileText,
  GraduationCap,
  Inbox,
  Info,
  Megaphone,
  Menu,
  MessageSquare,
  MessagesSquare,
  Search,
  Sun,
  UserRound,
  type LucideIcon,
} from "lucide-react";

// Навигация (SPEC §5.2, §5.3). Порядок пунктов одинаков на всех экранах (WCAG 3.2.3, 3.2.6).

export type NavBadgeKey = "schedule" | "study" | "requests" | "more" | "notifications";

export interface NavItem {
  href: string;
  label: string;
  /** Короткая подпись нижней панели (SPEC §7.5, AC-NAV.1): ≤ 7 букв, чтобы при 125% не обрезалась на 360 px. */
  short?: string;
  icon: LucideIcon;
  badge?: NavBadgeKey;
  /** Пункт активен и на вложенных адресах (/schedule/week → «Расписание»). */
  match?: string[];
}

/** Нижняя панель студента: ровно 5 пунктов, последний открывает лист «Ещё». */
export const STUDENT_TABS: NavItem[] = [
  { href: "/today", label: "Сегодня", icon: Sun },
  {
    href: "/schedule",
    label: "Расписание",
    short: "Пары",
    icon: CalendarDays,
    badge: "schedule",
  },
  { href: "/study", label: "Учёба", icon: GraduationCap, badge: "study" },
  { href: "/requests", label: "Заявки", icon: FileText, badge: "requests", match: ["/documents"] },
];

/** Лист «Ещё» на мобильной; на десктопе — нижняя часть боковой панели. */
export const STUDENT_MORE: NavItem[] = [
  { href: "/notifications", label: "Уведомления", icon: Bell, badge: "notifications" },
  { href: "/support", label: "Связь с деканатом", icon: MessageSquare },
  { href: "/search", label: "Поиск", icon: Search },
  { href: "/profile", label: "Профиль и настройки", icon: UserRound },
  { href: "/about", label: "О проекте", icon: Info, match: ["/jury", "/security"] },
];

export const MORE_TAB = { label: "Ещё", icon: Menu, badge: "more" as const };

/** Боковая панель сотрудника (§5.3). На мобильной те же пункты в нижней панели с короткими подписями. */
export const STAFF_NAV: NavItem[] = [
  {
    href: "/staff/queue",
    label: "Очередь заявок",
    short: "Очередь",
    icon: Inbox,
    match: ["/staff/requests"],
  },
  { href: "/staff/tickets", label: "Обращения", short: "Связь", icon: MessagesSquare },
  { href: "/staff/announcements", label: "Объявления", short: "Новости", icon: Megaphone },
  {
    href: "/staff/schedule",
    label: "Изменения расписания",
    short: "Пары",
    icon: CalendarClock,
  },
  { href: "/staff/profile", label: "Профиль", short: "Профиль", icon: UserRound },
];

export function isActive(pathname: string, item: Pick<NavItem, "href" | "match">): boolean {
  return [item.href, ...(item.match ?? [])].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export type NavBadges = Partial<Record<NavBadgeKey, number | boolean>>;

/** Текст бейджа для чтения с экрана: точка и число не должны быть только картинкой. */
export function badgeLabel(key: NavBadgeKey, value: number | boolean | undefined): string | null {
  if (!value) return null;
  switch (key) {
    case "schedule":
      return "есть изменения на неделе";
    case "requests":
      return "статус заявки изменился";
    case "study":
      return typeof value === "number"
        ? `дедлайнов в ближайшие 48 часов: ${value}`
        : "есть дедлайны";
    case "more":
    case "notifications":
      return typeof value === "number" ? `непрочитанных: ${value}` : "есть непрочитанные";
  }
}
