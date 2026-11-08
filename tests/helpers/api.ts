import { readdirSync } from "node:fs";
import { NextRequest } from "next/server";
import { getAuth } from "@/server/auth";
import { DEMO_ACCOUNTS, type DemoLogin } from "@db/seed/demo-accounts";
import { onSessionsReset } from "./db";

// Хелперы интеграционных тестов (DEEPSEEK-TASKS §2).
//   const res = await apiAs("anna").get("/api/me/requests");
//   expect(res.status).toBe(200); res.body — разобранный JSON, res.text — сырой ответ.
// Запрос уходит прямо в экспорт route.ts (без HTTP-сервера), с настоящей cookie-сессией Better Auth.

export { resetDb } from "./db";
export { freezeTime, unfreezeTime, countQueries } from "./clock";

export type Actor = DemoLogin | "guest";

const BASE = "http://localhost:3000";

export interface ApiResult<T = unknown> {
  status: number;
  headers: Headers;
  body: T;
  text: string;
}

interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
}

// ── сессии ──────────────────────────────────────────────────────────────────
const cookies = new Map<DemoLogin, string>();
onSessionsReset(() => cookies.clear());

/** Cookie сессии демо-аккаунта: настоящий вход по логину и паролю, один раз на resetDb. */
export async function sessionCookie(actor: DemoLogin): Promise<string> {
  const cached = cookies.get(actor);
  if (cached) return cached;
  const account = DEMO_ACCOUNTS[actor];
  const { headers } = await getAuth().api.signInUsername({
    body: { username: account.login, password: account.password },
    headers: new Headers({ "x-real-ip": "127.0.0.1" }),
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!cookie) throw new Error(`apiAs: вход ${actor} не выдал cookie`);
  cookies.set(actor, cookie);
  return cookie;
}

// ── маршрутизатор по файлам src/app/api/**/route.ts ────────────────────────
type Handler = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, unknown>> },
) => Promise<Response>;

export function listRouteFiles(): string[] {
  return readdirSync("src/app/api", { recursive: true, encoding: "utf8" })
    .map((f) => `src/app/api/${f.replaceAll("\\", "/")}`)
    .filter((f) => f.endsWith("/route.ts"))
    .sort();
}

/** src/app/api/me/requests/[id]/route.ts → /api/me/requests/:id */
export function routeFileToPath(file: string): string {
  const segments = file
    .replace(/^src\/app/, "")
    .replace(/\/route\.ts$/, "")
    .split("/")
    .filter((s) => s && !/^\(.*\)$/.test(s));
  return (
    "/" +
    segments
      .map((s) => s.replace(/^\[\.\.\.(\w+)\]$/, "*$1").replace(/^\[(\w+)\]$/, ":$1"))
      .join("/")
  );
}

function match(pattern: string, pathname: string): Record<string, unknown> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = pathname.split("/").filter(Boolean);
  const params: Record<string, unknown> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith("*")) {
      params[p[i].slice(1)] = s.slice(i).map(decodeURIComponent);
      return s.length > i ? params : null;
    }
    if (i >= s.length) return null;
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return p.length === s.length ? params : null;
}

async function resolve(method: string, pathname: string) {
  // Статические сегменты важнее динамических: /requests/new раньше /requests/:id.
  const routes = listRouteFiles()
    .map((file) => ({ file, pattern: routeFileToPath(file) }))
    .sort(
      (a, b) => b.pattern.replace(/[:*]\w+/g, "").length - a.pattern.replace(/[:*]\w+/g, "").length,
    );
  for (const { file, pattern } of routes) {
    const params = match(pattern, pathname);
    if (!params) continue;
    const mod: Record<string, unknown> = await import(/* @vite-ignore */ `../../${file}`);
    const handler = mod[method];
    // Нет маршрута — это ошибка теста, а не 404: иначе тест изоляции «прошёл бы» на несуществующем маршруте.
    if (typeof handler !== "function") throw new Error(`apiAs: ${file} не экспортирует ${method}`);
    return { handler: handler as Handler, params };
  }
  throw new Error(`apiAs: нет route.ts для ${method} ${pathname}`);
}

async function send<T>(
  actor: Actor,
  method: string,
  path: string,
  opts: RequestOptions = {},
): Promise<ApiResult<T>> {
  const url = new URL(path, BASE);
  const headers = new Headers(opts.headers);
  headers.set("x-real-ip", headers.get("x-real-ip") ?? "127.0.0.1");
  if (actor !== "guest") headers.set("cookie", await sessionCookie(actor));
  if (method !== "GET" && method !== "HEAD" && !headers.has("origin")) headers.set("origin", BASE);
  let body: string | undefined;
  if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers.set("content-type", "application/json");
  }
  const { handler, params } = await resolve(method, url.pathname);
  const res = await handler(new NextRequest(url, { method, headers, body }), {
    params: Promise.resolve(params),
  });
  const text = await res.text();
  let parsed: unknown = text;
  if (res.headers.get("content-type")?.includes("application/json") && text)
    parsed = JSON.parse(text);
  return { status: res.status, headers: res.headers, body: parsed as T, text };
}

export function apiAs(actor: Actor) {
  return {
    request: <T = unknown>(method: string, path: string, opts?: RequestOptions) =>
      send<T>(actor, method, path, opts),
    get: <T = unknown>(path: string, opts?: RequestOptions) => send<T>(actor, "GET", path, opts),
    post: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) =>
      send<T>(actor, "POST", path, { ...opts, body }),
    put: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) =>
      send<T>(actor, "PUT", path, { ...opts, body }),
    patch: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) =>
      send<T>(actor, "PATCH", path, { ...opts, body }),
    delete: <T = unknown>(path: string, opts?: RequestOptions) =>
      send<T>(actor, "DELETE", path, opts),
  };
}
