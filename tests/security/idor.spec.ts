import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { proxy } from "@/proxy";
import { apiAs, listRouteFiles, routeFileToPath, sessionCookie, type Actor } from "../helpers/api";
import { resetDb } from "../helpers/db";
import type { Fixtures } from "../helpers/fixtures";
import {
  apiRoutes,
  fillPath,
  ignoredRouteFiles,
  normalizePath,
  staffPages,
  type ApiRouteSpec,
  type RouteCase,
} from "./manifest";
import { notImplementedRoutes } from "./not-implemented";

// Матрица изоляции (SPEC §9.3) по манифесту:
//   гость → 401; роль не та → 403;
//   студент: чужой (Максим) → 404 на ресурс Ани или не видит его в списке, даже с подставленным studentId;
//   сотрудник: чужой факультет (Олег) → 404 или не видит; свой (Елена) — видит.
// Каждый маршрут манифеста обязан существовать; ещё не реализованные лежат в not-implemented.ts.
// Пропусков (skip) в наборе нет: проверка, неприменимая к маршруту, не регистрируется.

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/** Реализованные маршруты: «METHOD /нормализованный/путь» → файл. */
const implemented = new Map<string, string>();
for (const file of listRouteFiles()) {
  if (ignoredRouteFiles.includes(file)) continue;
  const mod: Record<string, unknown> = await import(/* @vite-ignore */ `../../${file}`);
  for (const method of METHODS) {
    if (typeof mod[method] === "function")
      implemented.set(`${method} ${normalizePath(routeFileToPath(file))}`, file);
  }
}
const keyOf = (r: ApiRouteSpec) => `${r.method} ${normalizePath(r.path)}`;
const isLive = (r: ApiRouteSpec) => implemented.has(keyOf(r));

let fx: Fixtures;
beforeAll(async () => {
  fx = await resetDb();
});

describe("манифест", () => {
  it("каждый экспортированный метод каждого route.ts зарегистрирован", () => {
    const registered = new Set(apiRoutes.map(keyOf));
    const missing = [...implemented].filter(([key]) => !registered.has(key));
    expect(
      missing.map(([key, file]) => `${key} (${file})`),
      "маршрута нет в tests/security/manifest.ts — вопрос в docs/ds-questions/",
    ).toEqual([]);
  });

  it("все маршруты манифеста существуют", () => {
    const absent = apiRoutes.filter((r) => !isLive(r)).map(keyOf);
    expect(absent).toEqual([]);
  });

  it("not-implemented.ts: route.ts этих маршрутов нет (появился — перенеси в манифест)", () => {
    const early = notImplementedRoutes
      .filter((r) => implemented.has(`${r.method} ${normalizePath(r.path)}`))
      .map((r) => `${r.method} ${r.path}`);
    expect(early).toEqual([]);
  });

  it("в манифесте нет дублей", () => {
    const keys = apiRoutes.map(keyOf);
    expect(keys.length).toBe(new Set(keys).size);
  });
});

/** Маршрут возвращает список: его фабрика case отдаёт ownerIds (определяем по тексту, fx до beforeAll нет). */
const hasOwnerIds = (route: ApiRouteSpec) => /\bownerIds\b/.test(String(route.case));

const INJECT = (fx: Fixtures) => ({ studentId: fx.users.anna, userId: fx.users.anna });

async function send(route: ApiRouteSpec, actor: Actor, extraQuery: Record<string, string> = {}) {
  const c: RouteCase = (await route.case?.(fx)) ?? {};
  const qs = new URLSearchParams({ ...c.query, ...extraQuery }).toString();
  const path = fillPath(route.path, c.params) + (qs ? `?${qs}` : "");
  const res = await apiAs(actor).request(route.method, path, { body: c.body, headers: c.headers });
  return { res, ownerIds: c.ownerIds };
}

const roles = {
  student: { owner: "anna", foreign: "maxim", wrongRole: "elena" },
  staff: { owner: "elena", foreign: "oleg", wrongRole: "anna" },
} as const;

for (const route of apiRoutes) {
  const title = `${route.method} ${route.path} [${route.ticket}]`;

  if (route.access === "public") {
    describe(title, () => {
      it("гость с несуществующим токеном: не 401 и не 5xx", async () => {
        const { res } = await send(route, "guest");
        expect([200, 404]).toContain(res.status);
      });
    });
    continue;
  }

  const who = roles[route.access];
  describe(title, () => {
    it("гость → 401 UNAUTHORIZED", async () => {
      const { res } = await send(route, "guest");
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: { code: "UNAUTHORIZED" } });
    });

    it(`${who.wrongRole} (другая роль) → 403 FORBIDDEN`, async () => {
      const { res } = await send(route, who.wrongRole);
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    });

    it(`${who.owner} (владелец) → 2xx`, async () => {
      const { res } = await send(route, who.owner);
      expect(res.status, res.text).toBeGreaterThanOrEqual(200);
      expect(res.status, res.text).toBeLessThan(300);
    });

    // Для студента повторяем чужой запрос с подставленными studentId/userId: их нужно игнорировать.
    const attempts = () => (route.access === "student" ? [{}, INJECT(fx)] : [{}]);

    if (route.owned) {
      it(`${who.foreign} (чужой) → 404 NOT_FOUND${route.access === "student" ? ", в том числе с подставленным studentId" : ""}`, async () => {
        for (const extra of attempts()) {
          const { res } = await send(route, who.foreign, extra);
          expect(res.status, res.text).toBe(404);
          expect(res.body).toEqual({ error: { code: "NOT_FOUND" } });
        }
      });
    }

    // Списки (ownerIds в case): чужой не видит ресурсов владельца, владелец видит. Фабрика case
    // чистая, поэтому наличие ownerIds известно до запроса.
    if (hasOwnerIds(route)) {
      it(`${who.foreign} (чужой): в ответе нет ресурсов владельца`, async () => {
        for (const extra of attempts()) {
          const { res, ownerIds } = await send(route, who.foreign, extra);
          expect(ownerIds?.length).toBeGreaterThan(0);
          expect(res.status).toBe(200);
          for (const id of ownerIds ?? []) expect(res.text).not.toContain(id);
        }
      });

      it(`${who.owner} (владелец) видит свои ресурсы`, async () => {
        const { res, ownerIds } = await send(route, who.owner);
        expect(res.status).toBe(200);
        for (const id of ownerIds ?? []) expect(res.text).toContain(id);
      });
    }
  });
}

describe("страницы /staff/* (AC-9.1)", () => {
  const visit = async (path: string, actor: "anna" | "elena" | "guest") => {
    const cookie = actor === "guest" ? "" : await sessionCookie(actor);
    return proxy(new NextRequest(new URL(path, "http://localhost:3000"), { headers: { cookie } }));
  };

  it.each(staffPages)("%s: студент → 403 с экраном, без rewrite", async (path) => {
    const res = await visit(path, "anna");
    expect(res.status).toBe(403);
    // rewrite со статусом 403 в настоящем Next превращается в 200 — поэтому ответ должен быть конечным.
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(await res.text()).toContain("Раздел для сотрудников");
  });

  it.each(staffPages)("%s: гость → редирект на /login", async (path) => {
    const res = await visit(path, "guest");
    expect([302, 303, 307]).toContain(res.status);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it.each(staffPages)("%s: сотрудник проходит", async (path) => {
    const res = await visit(path, "elena");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
