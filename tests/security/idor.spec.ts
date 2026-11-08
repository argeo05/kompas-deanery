import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { proxy } from "@/proxy";
import { apiAs, listRouteFiles, routeFileToPath, sessionCookie } from "../helpers/api";
import { resetDb } from "../helpers/db";
import type { Fixtures } from "../helpers/fixtures";
import { apiRoutes, fillPath, ignoredRouteFiles, staffPages, type ApiRouteSpec } from "./manifest";

// Матрица изоляции (SPEC §9.3): для каждого маршрута манифеста —
// гость → 401, чужой студент → 404 (или отсутствие в списке), роль не та → 403.
// Аня — владелец ресурсов, Максим — другой студент (другой факультет), Елена — сотрудник.

let fx: Fixtures;
beforeAll(async () => {
  fx = await resetDb();
});

const label = (r: ApiRouteSpec) => `${r.method} ${r.path}`;
const pathFor = (r: ApiRouteSpec) => fillPath(r.path, r.params?.(fx));

describe("манифест покрывает все маршруты API", () => {
  it("каждый экспортированный метод каждого route.ts зарегистрирован", async () => {
    const registered = new Set(apiRoutes.map(label));
    const missing: string[] = [];
    for (const file of listRouteFiles()) {
      if (ignoredRouteFiles.includes(file)) continue;
      const mod: Record<string, unknown> = await import(/* @vite-ignore */ `../../${file}`);
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
        if (typeof mod[method] !== "function") continue;
        const key = `${method} ${routeFileToPath(file)}`;
        if (!registered.has(key)) missing.push(key);
      }
    }
    expect(missing, "зарегистрируйте маршруты в tests/security/manifest.ts").toEqual([]);
  });
});

describe.each(apiRoutes.filter((r) => r.access !== "public"))("$method $path", (route) => {
  const send = (actor: Parameters<typeof apiAs>[0], extraQuery = "") =>
    apiAs(actor).request(route.method, pathFor(route) + extraQuery, { body: route.body?.(fx) });

  it("гость → 401 UNAUTHORIZED", async () => {
    const res = await send("guest");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: "UNAUTHORIZED" } });
  });

  if (route.access === "student") {
    it("сотрудник → 403 FORBIDDEN", async () => {
      const res = await send("elena");
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    });

    if (route.params) {
      it("владелец получает ресурс (маршрут живой, а не 404 по умолчанию)", async () => {
        const res = await send("anna");
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(300);
      });

      it("чужой студент → 404 NOT_FOUND, в том числе с подставленным studentId", async () => {
        for (const query of ["", `?studentId=${fx.users.anna}&userId=${fx.users.anna}`]) {
          const res = await send("maxim", query);
          expect(res.status).toBe(404);
          expect(res.body).toEqual({ error: { code: "NOT_FOUND" } });
        }
      });
    }

    if (route.annaIds) {
      it("в ответе чужому студенту нет ресурсов Ани, даже с подставленным studentId", async () => {
        const ids = route.annaIds!(fx);
        expect(ids.length).toBeGreaterThan(0);
        for (const query of ["", `?studentId=${fx.users.anna}&userId=${fx.users.anna}`]) {
          const res = await send("maxim", query);
          expect(res.status).toBe(200);
          for (const id of ids) expect(res.text).not.toContain(id);
        }
      });

      it("владелец видит свои ресурсы", async () => {
        const res = await send("anna");
        expect(res.status).toBe(200);
        for (const id of route.annaIds!(fx)) expect(res.text).toContain(id);
      });
    }
  }

  if (route.access === "staff") {
    it("студент → 403 FORBIDDEN", async () => {
      const res = await send("anna");
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    });
  }
});

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
