import type { Fixtures } from "../helpers/fixtures";

// Реестр маршрутов для матрицы изоляции (SPEC §9.3, AC-5.3, AC-9.1).
// Каждый route.ts в src/app/api обязан быть здесь: это проверяет idor.spec.ts.
// Новые эндпоинты DeepSeek регистрирует Claude (DEEPSEEK-TASKS §2).

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRouteSpec {
  method: Method;
  /** Путь в стиле `/api/me/requests/:id`. */
  path: string;
  /** student — /api/me/*, staff — /api/staff/*, public — без сессии (помечается в тикете явно). */
  access: "student" | "staff" | "public";
  /** Значения параметров пути: ресурс, который принадлежит Ане. Для маршрутов без параметров не задаётся. */
  params?: (fx: Fixtures) => Record<string, string>;
  /** Тело запроса для изменяющих методов (валидное для владельца). */
  body?: (fx: Fixtures) => unknown;
  /** Для списков: id ресурсов Ани, которых не должно быть в ответе другому студенту. */
  annaIds?: (fx: Fixtures) => string[];
}

export const apiRoutes: ApiRouteSpec[] = [
  {
    method: "GET",
    path: "/api/me/requests",
    access: "student",
    annaIds: (fx) => fx.requests.anna,
  },
  {
    method: "GET",
    path: "/api/me/requests/:id",
    access: "student",
    params: (fx) => ({ id: fx.requests.anna[0] }),
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
];

export function fillPath(path: string, params: Record<string, string> = {}): string {
  return path.replace(/:(\w+)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`manifest: нет значения для :${name} в ${path}`);
    return encodeURIComponent(value);
  });
}
