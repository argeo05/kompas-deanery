import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ARGON2_PARAMS, hashPassword, verifyPassword } from "@/server/auth/password";
import { HttpError, parseJson, parseQuery, route } from "@/server/http";

describe("Argon2id (SPEC §9.2)", () => {
  it("параметры не ниже минимума OWASP: 19 МиБ, 2 итерации, Argon2id", () => {
    expect(ARGON2_PARAMS.algorithm).toBe(2);
    expect(ARGON2_PARAMS.memoryCost).toBeGreaterThanOrEqual(19 * 1024);
    expect(ARGON2_PARAMS.timeCost).toBeGreaterThanOrEqual(2);
  });

  it("verify: верный пароль, неверный пароль, мусор вместо хеша", async () => {
    const hash = await hashPassword("correct horse");
    expect(await verifyPassword({ hash, password: "correct horse" })).toBe(true);
    expect(await verifyPassword({ hash, password: "wrong" })).toBe(false);
    expect(await verifyPassword({ hash: "garbage", password: "x" })).toBe(false);
  });
});

describe("http: вход", () => {
  const schema = z.object({
    tab: z.enum(["a", "b"]).default("a"),
    limit: z.coerce.number().max(50).default(20),
  });

  it("parseQuery: значения по умолчанию, лишние ключи (studentId) отброшены", () => {
    expect(parseQuery("http://x/api?studentId=evil", schema)).toEqual({ tab: "a", limit: 20 });
  });

  it("parseQuery: ошибка → HttpError 422 с путями полей", () => {
    try {
      parseQuery("http://x/api?limit=500", schema);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect(e).toMatchObject({
        status: 422,
        code: "VALIDATION",
        details: { issues: [{ path: "limit" }] },
      });
    }
  });

  it("parseJson: неверный JSON → 422 INVALID_JSON", async () => {
    const req = new Request("http://x/api", { method: "POST", body: "{oops" });
    await expect(parseJson(req, schema)).rejects.toMatchObject({
      status: 422,
      details: { reason: "INVALID_JSON" },
    });
  });
});

describe("http: route()", () => {
  const handler = route(async () => Response.json({ ok: true }));
  const call = (method: string, origin?: string) =>
    handler(
      new NextRequest("http://localhost:3000/api/x", { method, headers: origin ? { origin } : {} }),
      { params: Promise.resolve({}) },
    );

  it("POST с чужим Origin или без Origin → 403 (CSRF, SPEC §9.2)", async () => {
    expect((await call("POST", "https://evil.example")).status).toBe(403);
    expect((await call("POST")).status).toBe(403);
    expect((await call("POST", "http://localhost:3000")).status).toBe(200);
  });

  it("GET без Origin проходит", async () => {
    expect((await call("GET")).status).toBe(200);
  });

  it("неожиданная ошибка → 500 INTERNAL без подробностей", async () => {
    const broken = route(async () => {
      throw new Error("secret detail");
    });
    const res = await broken(new NextRequest("http://localhost:3000/api/x"), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "INTERNAL" } });
  });
});
