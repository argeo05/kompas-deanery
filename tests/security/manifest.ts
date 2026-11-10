import { randomUUID } from "node:crypto";
import type { Fixtures } from "../helpers/fixtures";
import * as f from "./factories";

// Реестр маршрутов для матрицы изоляции (SPEC §9.3, AC-5.3, AC-9.1). Его ведёт только Claude.
// Здесь заранее перечислены ВСЕ маршруты DEEPSEEK-TASKS §4 (DS-10…DS-33), поэтому DeepSeek
// tests/security не правит: как только появляется route.ts с нужным методом, его проверки
// включаются сами (idor.spec.ts). Каждый маршрут из манифеста обязан существовать (0 skipped, C1).
// Маршруты из SPEC, которых ещё нет, перечислены в not-implemented.ts: они обязаны отвечать 404.
//
// Имена параметров пути при сравнении с файлами не важны: `/api/me/plans/:id` совпадает
// с src/app/api/me/plans/[planId]/route.ts.

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Что нужно для одного запроса. Фабрика вызывается заново перед каждой проверкой. */
export interface RouteCase {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
  /**
   * Для списков: id ресурсов владельца. Их нет в ответе чужому (Максиму или Олегу),
   * и они есть в ответе владельцу (Ане или Елене).
   */
  ownerIds?: string[];
}

export interface ApiRouteSpec {
  method: Method;
  /** Путь в стиле `/api/me/requests/:id`. */
  path: string;
  /** student — студент (Аня; чужой — Максим), staff — сотрудник (Елена; чужой факультет — Олег), public — без сессии. */
  access: "student" | "staff" | "public";
  /** Тикет, в котором маршрут появляется (A2 — эталон Claude). */
  ticket: string;
  /**
   * Запрос ссылается на ресурс владельца (в пути или теле): чужой получает 404 NOT_FOUND,
   * владелец — 2xx.
   */
  owned?: true;
  case?: (fx: Fixtures) => RouteCase | Promise<RouteCase>;
}

const idem = () => ({ "idempotency-key": randomUUID() });

export const apiRoutes: ApiRouteSpec[] = [
  // ── Эталон (A2) ──────────────────────────────────────────────────────────
  {
    method: "GET",
    path: "/api/me/requests",
    access: "student",
    ticket: "A2",
    case: (fx) => ({ ownerIds: fx.requests.anna }),
  },
  {
    method: "GET",
    path: "/api/me/requests/:id",
    access: "student",
    ticket: "A2",
    owned: true,
    case: (fx) => ({ params: { id: fx.requests.anna[0] } }),
  },

  // ── DS-10. Профиль ───────────────────────────────────────────────────────
  { method: "GET", path: "/api/me", access: "student", ticket: "DS-10" },
  {
    method: "PATCH",
    path: "/api/me",
    access: "student",
    ticket: "DS-10",
    case: () => ({ body: { displayName: "Аня" } }),
  },

  // ── DS-11. Расписание ────────────────────────────────────────────────────
  {
    method: "GET",
    path: "/api/me/schedule",
    access: "student",
    ticket: "DS-11",
    case: async (fx) => {
      const { date } = await f.annaStudyDay(fx);
      return {
        query: { from: date, to: date },
        ownerIds: await f.annaClassesBetween(fx, date, date),
      };
    },
  },
  {
    method: "POST",
    path: "/api/me/schedule/changes/seen",
    access: "student",
    ticket: "DS-11",
    case: async (fx) => ({ body: { changeIds: [await f.annaScheduleChange(fx)] } }),
  },
  {
    method: "PUT",
    path: "/api/me/classes/:classId/note",
    access: "student",
    ticket: "DS-11",
    owned: true,
    case: async (fx) => ({
      params: { classId: await f.annaClass(fx) },
      body: { text: "Взять калькулятор" },
    }),
  },

  // ── DS-12, DS-13. Успеваемость ───────────────────────────────────────────
  {
    method: "GET",
    path: "/api/me/grades",
    access: "student",
    ticket: "DS-12",
    case: async (fx) => ({ ownerIds: await f.annaOnlyCourses(fx) }),
  },
  {
    method: "GET",
    path: "/api/me/grades/:courseId",
    access: "student",
    ticket: "DS-13",
    owned: true,
    case: async (fx) => ({ params: { courseId: (await f.annaOnlyCourses(fx))[0] } }),
  },

  // ── DS-14. Сессия ────────────────────────────────────────────────────────
  { method: "GET", path: "/api/me/session", access: "student", ticket: "DS-14" },

  // ── DS-15. Дедлайны и планы ──────────────────────────────────────────────
  {
    method: "GET",
    path: "/api/me/deadlines",
    access: "student",
    ticket: "DS-15",
    case: async (fx) => ({ ownerIds: [await f.annaDeadline(fx)] }),
  },
  {
    method: "POST",
    path: "/api/me/deadlines",
    access: "student",
    ticket: "DS-15",
    case: () => ({ body: { title: "Подготовить доклад", dueAt: f.isoIn(72) } }),
  },
  ...(["star", "unstar", "done", "undone"] as const).map((action): ApiRouteSpec => ({
    method: "POST",
    path: `/api/me/deadlines/:id/${action}`,
    access: "student",
    ticket: "DS-15",
    owned: true,
    case: async (fx) => ({ params: { id: await f.annaDeadline(fx) } }),
  })),
  {
    method: "GET",
    path: "/api/me/deadlines/:id/windows",
    access: "student",
    ticket: "DS-15",
    owned: true,
    case: async (fx) => ({ params: { id: await f.annaDeadline(fx) } }),
  },
  {
    method: "POST",
    path: "/api/me/plans",
    access: "student",
    ticket: "DS-15",
    // Дедлайн Ани в теле: Максим не может повесить план на чужой дедлайн.
    owned: true,
    case: async (fx) => ({
      body: {
        deadlineId: await f.annaDeadline(fx, { starred: true }),
        ...f.planWindow(),
        place: "Библиотека",
        firstAction: "Открыть черновик",
      },
    }),
  },
  {
    method: "DELETE",
    path: "/api/me/plans/:id",
    access: "student",
    ticket: "DS-15",
    owned: true,
    case: async (fx) => ({ params: { id: await f.annaPlan(fx) } }),
  },

  // ── DS-16. Каталог справок ───────────────────────────────────────────────
  {
    method: "GET",
    path: "/api/request-types",
    access: "student",
    ticket: "DS-16",
  },

  // ── DS-17. Заявки: создание, отмена, переписка ───────────────────────────
  {
    method: "POST",
    path: "/api/me/requests",
    access: "student",
    ticket: "DS-17",
    case: () => ({
      headers: idem(),
      body: { typeCode: "study_cert", delivery: "electronic", copies: 1, fields: {} },
    }),
  },
  {
    method: "POST",
    path: "/api/me/requests/:id/cancel",
    access: "student",
    ticket: "DS-17",
    owned: true,
    case: async (fx) => ({ params: { id: await f.annaRequest(fx, "submitted") } }),
  },
  {
    method: "POST",
    path: "/api/me/requests/:id/seen",
    access: "student",
    ticket: "C4",
    owned: true,
    case: async (fx) => ({ params: { id: await f.annaRequest(fx, "ready") } }),
  },
  {
    method: "POST",
    path: "/api/me/requests/:id/messages",
    access: "student",
    ticket: "DS-17",
    owned: true,
    case: async (fx) => ({
      params: { id: await f.annaRequest(fx, "needs_info") },
      body: { body: "Нужна за все семестры" },
    }),
  },
  {
    method: "POST",
    path: "/api/me/requests/:id/resubmit",
    access: "student",
    ticket: "DS-17",
    owned: true,
    case: async (fx) => ({
      params: { id: await f.annaRequest(fx, "rejected") },
      headers: idem(),
      body: { fields: {} },
    }),
  },
  {
    method: "POST",
    path: "/api/me/data-fix",
    access: "student",
    ticket: "DS-17",
    case: () => ({ headers: idem(), body: { field: "other", comment: "Опечатка в отчестве" } }),
  },

  // ── DS-18. Уведомления ───────────────────────────────────────────────────
  {
    method: "GET",
    path: "/api/me/notifications",
    access: "student",
    ticket: "DS-18",
    case: async (fx) => ({ ownerIds: [await f.annaNotification(fx)] }),
  },
  {
    method: "POST",
    path: "/api/me/notifications/read",
    access: "student",
    ticket: "DS-18",
    case: () => ({ body: { all: true } }),
  },
  {
    method: "GET",
    path: "/api/me/notification-prefs",
    access: "student",
    ticket: "DS-18",
  },
  {
    method: "PUT",
    path: "/api/me/notification-prefs",
    access: "student",
    ticket: "DS-18",
    case: () => ({
      body: {
        slots: [480, 780, 1140],
        preset: "default",
        quietFrom: 1380,
        quietTo: 420,
        immediateCategories: [],
        disabledCategories: [],
      },
    }),
  },

  // ── DS-19. Документы ─────────────────────────────────────────────────────
  {
    method: "GET",
    path: "/api/me/documents",
    access: "student",
    ticket: "DS-19",
    case: async (fx) => ({ ownerIds: [await f.annaDocument(fx)] }),
  },
  {
    method: "GET",
    path: "/api/me/documents/:id/file",
    access: "student",
    ticket: "C4",
    owned: true,
    case: async (fx) => ({ params: { id: await f.annaDocument(fx) } }),
  },

  // ── DS-20. Главная ───────────────────────────────────────────────────────
  { method: "GET", path: "/api/me/today", access: "student", ticket: "DS-20" },

  // ── DS-21. Обращения ─────────────────────────────────────────────────────
  {
    method: "GET",
    path: "/api/me/tickets",
    access: "student",
    ticket: "DS-21",
    case: async (fx) => ({ ownerIds: [await f.annaTicket(fx)] }),
  },
  {
    method: "POST",
    path: "/api/me/tickets",
    access: "student",
    ticket: "DS-21",
    // Связанная заявка Ани в теле: Максим получает 404 (DS-21).
    owned: true,
    case: async (fx) => ({
      headers: idem(),
      body: {
        topic: "requests",
        body: "Когда будет готова справка?",
        link: { kind: "request", id: await f.annaRequest(fx, "in_progress") },
      },
    }),
  },
  {
    method: "GET",
    path: "/api/me/tickets/:id",
    access: "student",
    ticket: "DS-21",
    owned: true,
    case: async (fx) => ({ params: { id: await f.annaTicket(fx) } }),
  },
  {
    method: "POST",
    path: "/api/me/tickets/:id/messages",
    access: "student",
    ticket: "DS-21",
    owned: true,
    case: async (fx) => ({
      params: { id: await f.annaTicket(fx) },
      body: { body: "Дополню вопрос" },
    }),
  },

  // ── DS-22. Календарь ICS ─────────────────────────────────────────────────
  { method: "GET", path: "/api/me/ics", access: "student", ticket: "DS-22" },
  { method: "POST", path: "/api/me/ics/rotate", access: "student", ticket: "DS-22" },
  {
    method: "GET",
    path: "/api/ics/:token",
    access: "public",
    ticket: "DS-22",
    case: () => ({ params: { token: `${"0".repeat(64)}.ics` } }),
  },

  // ── DS-23. Проверка подлинности справки ──────────────────────────────────
  {
    method: "GET",
    path: "/api/verify/:code",
    access: "public",
    ticket: "DS-23",
    case: () => ({ params: { code: "0".repeat(32) } }),
  },

  // ── DS-30. Очередь заявок (сотрудник) ────────────────────────────────────
  {
    method: "GET",
    path: "/api/staff/requests",
    access: "staff",
    ticket: "DS-30",
    case: async (fx) => ({
      query: { sort: "dueAt" },
      ownerIds: [await f.annaRequest(fx, "submitted")],
    }),
  },
  {
    method: "GET",
    path: "/api/staff/requests/:id",
    access: "staff",
    ticket: "DS-30",
    owned: true,
    case: async (fx) => ({ params: { id: await f.annaRequest(fx, "submitted") } }),
  },
  {
    method: "POST",
    path: "/api/staff/requests/:id/transition",
    access: "staff",
    ticket: "DS-30",
    owned: true,
    case: async (fx) => ({
      params: { id: await f.annaRequest(fx, "submitted") },
      body: { action: "take" },
    }),
  },
  {
    method: "POST",
    path: "/api/staff/requests/:id/messages",
    access: "staff",
    ticket: "DS-30",
    owned: true,
    case: async (fx) => ({
      params: { id: await f.annaRequest(fx, "in_progress") },
      body: { body: "Справка будет завтра" },
    }),
  },

  // ── DS-31. Объявления ────────────────────────────────────────────────────
  {
    method: "GET",
    path: "/api/staff/announcements",
    access: "staff",
    ticket: "DS-31",
    case: async (fx) => ({ ownerIds: [await f.annaGroupAnnouncement(fx)] }),
  },
  {
    method: "POST",
    path: "/api/staff/announcements",
    access: "staff",
    ticket: "DS-31",
    case: async (fx) => ({
      headers: idem(),
      body: {
        title: "Перенос консультации",
        bodyMd: "Консультация переносится на четверг.",
        audience: { groupIds: [await f.annaGroupId(fx)] },
        important: false,
      },
    }),
  },
  {
    method: "POST",
    path: "/api/staff/announcements/:id/archive",
    access: "staff",
    ticket: "DS-31",
    owned: true,
    case: async (fx) => ({ params: { id: await f.annaGroupAnnouncement(fx) } }),
  },
  {
    method: "GET",
    path: "/api/me/announcements",
    access: "student",
    ticket: "DS-31",
    case: async (fx) => ({ ownerIds: [await f.annaGroupAnnouncement(fx)] }),
  },

  // ── C5. Поиск ────────────────────────────────────────────────────────────
  {
    method: "GET",
    path: "/api/me/search",
    access: "student",
    ticket: "C5",
    case: () => ({ query: { q: "справка" } }),
  },

  { method: "GET", path: "/api/me/kb", access: "student", ticket: "C5" },
  {
    method: "GET",
    path: "/api/me/kb/:slug",
    access: "student",
    ticket: "C5",
    case: () => ({ params: { slug: "resit-exam" } }),
  },

  // ── DS-32. Изменения расписания ──────────────────────────────────────────
  {
    method: "GET",
    path: "/api/staff/classes",
    access: "staff",
    ticket: "DS-32",
    case: async (fx) => {
      const { date, classIds } = await f.annaStudyDay(fx);
      return { query: { date }, ownerIds: classIds };
    },
  },
  {
    method: "POST",
    path: "/api/staff/classes/:id/changes",
    access: "staff",
    ticket: "DS-32",
    owned: true,
    case: async (fx) => ({
      params: { id: await f.annaClass(fx) },
      headers: idem(),
      body: { type: "cancelled", reason: "Преподаватель болеет" },
    }),
  },

  // ── DS-33. Обращения (сотрудник) ─────────────────────────────────────────
  {
    method: "GET",
    path: "/api/staff/tickets",
    access: "staff",
    ticket: "DS-33",
    case: async (fx) => ({ ownerIds: [await f.annaTicket(fx)] }),
  },
  {
    method: "GET",
    path: "/api/staff/tickets/:id",
    access: "staff",
    ticket: "DS-33",
    owned: true,
    case: async (fx) => ({ params: { id: await f.annaTicket(fx) } }),
  },
  {
    method: "POST",
    path: "/api/staff/tickets/:id/messages",
    access: "staff",
    ticket: "DS-33",
    owned: true,
    case: async (fx) => ({
      params: { id: await f.annaTicket(fx) },
      body: { body: "Ответ деканата" },
    }),
  },
  {
    method: "POST",
    path: "/api/staff/tickets/:id/close",
    access: "staff",
    ticket: "DS-33",
    owned: true,
    case: async (fx) => ({ params: { id: await f.annaTicket(fx) } }),
  },
];

/** Маршруты Better Auth обслуживает сама библиотека; матрица их не проверяет. */
export const ignoredRouteFiles = ["src/app/api/auth/[...all]/route.ts"];

/** Страницы кабинета сотрудника (SPEC §5.4). Студент получает 403, гость — редирект на вход. */
export const staffPages = [
  "/staff/queue",
  "/staff/requests/00000000-0000-4000-8000-000000000000",
  "/staff/tickets",
  "/staff/announcements",
  "/staff/announcements/new",
  "/staff/schedule",
  // Варианты записи пути не должны обходить проверку (аудит C1).
  "/staff/",
  "/STAFF/queue",
  "/%73taff/queue",
  "/staff//queue",
];

/** `/api/me/plans/:id` и `/api/me/plans/:planId` — один маршрут. */
export function normalizePath(path: string): string {
  return path.replace(/:\w+/g, ":");
}

export function fillPath(path: string, params: Record<string, string> = {}): string {
  return path.replace(/:(\w+)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`manifest: нет значения для :${name} в ${path}`);
    return encodeURIComponent(value);
  });
}
