import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { accounts, sessions, users } from "@db/schema";
import { DEMO_ACCOUNTS } from "@db/seed/demo-accounts";
import { hashSessionToken } from "@/server/auth/session-token-hash";
import { getDb } from "@/server/db";
import { apiAs, resetDb } from "../helpers/api";
import type { Fixtures } from "../helpers/fixtures";

// Better Auth: вход по логину, Argon2id, отключённая регистрация, лимит попыток в БД (SPEC §6.1, §9.2).
// Каждый тест берёт свой IP: лимит считается на пару IP + путь.

let fx: Fixtures;
beforeAll(async () => {
  fx = await resetDb();
});

let ipCounter = 10;
const nextIp = () => `198.51.100.${ipCounter++}`;
const signIn = (username: string, password: string, ip = nextIp()) =>
  apiAs("guest").post(
    "/api/auth/sign-in/username",
    { username, password },
    { headers: { "x-real-ip": ip } },
  );

describe("Better Auth", () => {
  it("пароль хранится как Argon2id не ниже рекомендации SPEC (64 МиБ, 3 итерации)", async () => {
    const [row] = await getDb()
      .select({ hash: accounts.password })
      .from(accounts)
      .where(eq(accounts.userId, fx.users.anna));
    expect(row.hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect(row.hash).not.toContain(DEMO_ACCOUNTS.anna.password);
  });

  it("логин с пробелами и заглавными входит (AC-1.9), сессия в БД, IP — хешем", async () => {
    const res = await signIn("  Anna.Demo ", DEMO_ACCOUNTS.anna.password, "203.0.113.7");
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().join(";")).toMatch(/kompas\.session_token=.+HttpOnly/i);
    const rows = await getDb().select().from(sessions).where(eq(sessions.userId, fx.users.anna));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.ipAddress)).not.toContain("203.0.113.7");
  });

  it("неверный пароль и несуществующий логин дают одинаковый ответ (AC-1.2)", async () => {
    const wrongPassword = await signIn("anna.demo", "wrong-password-123");
    const unknownLogin = await signIn("nobody.demo", "wrong-password-123");
    expect(wrongPassword.status).toBe(401);
    expect(unknownLogin.status).toBe(401);
    expect(unknownLogin.body).toEqual(wrongPassword.body);
  });

  it("регистрация отключена", async () => {
    const res = await apiAs("guest").post(
      "/api/auth/sign-up/email",
      {
        email: "new@example.edu",
        password: "some-password-1",
        name: "Новый",
        username: "new.user",
      },
      { headers: { "x-real-ip": nextIp() } },
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    const [{ n }] = await getDb().execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM ${users} WHERE ${users.username} = 'new.user'`,
    );
    expect(n).toBe(0);
  });

  it("лишние маршруты Better Auth закрыты: вход по e-mail, перебор и смена логина", async () => {
    const guest = apiAs("guest");
    const opts = { headers: { "x-real-ip": nextIp() } };
    const email = await guest.post(
      "/api/auth/sign-in/email",
      { email: "anna.demo@example.edu", password: DEMO_ACCOUNTS.anna.password },
      opts,
    );
    expect(email.status).toBe(404);
    expect(
      (await guest.post("/api/auth/is-username-available", { username: "anna.demo" }, opts)).status,
    ).toBe(404);
    const rename = await apiAs("anna").post(
      "/api/auth/update-user",
      { username: "zz.renamed" },
      opts,
    );
    expect(rename.status).toBe(404);
    const [row] = await getDb()
      .select({ login: users.username })
      .from(users)
      .where(eq(users.id, fx.users.anna));
    expect(row.login).toBe("anna.demo");
  });

  it("демо-аккаунт не может сменить пароль (SPEC §6.1 «Тонкости»)", async () => {
    const res = await apiAs("maxim").post(
      "/api/auth/change-password",
      { currentPassword: DEMO_ACCOUNTS.maxim.password, newPassword: "hijacked-password-1" },
      { headers: { "x-real-ip": nextIp() } },
    );
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "DEMO_PASSWORD_LOCKED" });
    expect((await signIn("maxim.demo", DEMO_ACCOUNTS.maxim.password)).status).toBe(200);
  });

  it("6-я попытка входа подряд с одного IP → 429, счётчик хранится в БД", async () => {
    const ip = nextIp();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++)
      statuses.push((await signIn("anna.demo", "wrong-password-123", ip)).status);
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    const [{ n }] = await getDb().execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM rate_limits WHERE key LIKE ${`%${ip}%`}`,
    );
    expect(n).toBe(1);
  });
  it("в БД лежит SHA-256 токена сессии, а не сам токен; по cookie сессия находится (SPEC §9.2)", async () => {
    const res = await signIn("anna.demo", DEMO_ACCOUNTS.anna.password);
    expect(res.status).toBe(200);
    const raw = (res.body as { token: string }).token;
    const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]);
    const rows = await getDb().select({ token: sessions.token }).from(sessions);
    const stored = rows.map((r) => r.token);
    expect(stored).not.toContain(raw);
    expect(stored).toContain(hashSessionToken(raw));
    const me = await apiAs("guest").request("GET", "/api/auth/get-session", {
      headers: { cookie: cookie.join("; ") },
    });
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ user: { id: fx.users.anna } });
  });

  it("лимит по логину: 21-я неудача с разных IP → 429, верный пароль тоже блокируется", async () => {
    const login = "oleg.staff";
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await signIn(login, "wrong-password-123")).status);
    expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true);
    expect(statuses[20]).toBe(429);
    expect((await signIn(login, DEMO_ACCOUNTS.oleg.password)).status).toBe(429);
    // Другой логин с нового IP не затронут.
    expect((await signIn("anna.demo", DEMO_ACCOUNTS.anna.password)).status).toBe(200);
  });

  it("подмена X-Forwarded-For не обходит лимит по IP: ключ берётся из доверенного заголовка", async () => {
    const ip = nextIp();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await apiAs("guest").post(
        "/api/auth/sign-in/username",
        { username: "anna.demo", password: "wrong-password-123" },
        { headers: { "x-real-ip": ip, "x-forwarded-for": `203.0.113.${i + 1}` } },
      );
      statuses.push(res.status);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it("маршруты списка и отзыва сессий закрыты (токены в БД хешированы)", async () => {
    const opts = { headers: { "x-real-ip": nextIp() } };
    for (const path of ["/list-sessions", "/revoke-session", "/revoke-other-sessions"]) {
      const res = await apiAs("anna").post(`/api/auth${path}`, { token: "x" }, opts);
      expect(res.status, path).toBe(404);
    }
  });
});
