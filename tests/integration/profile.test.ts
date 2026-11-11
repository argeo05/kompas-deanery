import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sessions, users } from "@db/schema";
import { DEMO_ACCOUNTS } from "@db/seed/demo-accounts";
import type { DemoResetDTO, SessionsDTO } from "@/contracts/api";
import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db";
import { describeDevice } from "@/server/services/sessions";
import { apiAs, resetDb } from "../helpers/api";

// C8 · профиль: сеансы (список, завершение, «выйти на всех» — AC-11.2), экспорт данных, демо-сброс.

beforeAll(async () => {
  await resetDb();
});
afterAll(async () => {
  await resetDb();
});

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

async function signInWithAgent(login: keyof typeof DEMO_ACCOUNTS, ip: string, agent = IPHONE) {
  const { headers } = await getAuth().api.signInUsername({
    body: { username: DEMO_ACCOUNTS[login].login, password: DEMO_ACCOUNTS[login].password },
    headers: new Headers({ "x-real-ip": ip, "user-agent": agent }),
    returnHeaders: true,
  });
  return headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

describe("describeDevice", () => {
  it("называет браузер и систему, а строку User-Agent не отдаёт", () => {
    expect(describeDevice(IPHONE)).toBe("Safari · iOS");
    expect(describeDevice(null)).toBe("Неизвестное устройство");
    expect(describeDevice("curl/8")).toBe("Неизвестное устройство");
  });
});

describe("сеансы", () => {
  it("список: свои сеансы, текущий помечен, токена и User-Agent в ответе нет", async () => {
    await signInWithAgent("anna", "203.0.113.10");
    const res = await apiAs("anna").get<SessionsDTO>("/api/me/sessions");
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(2);
    expect(res.body.items.filter((s) => s.current)).toHaveLength(1);
    expect(res.text).not.toMatch(/token|Mozilla/i);
    expect(res.body.items.some((s) => s.device === "Safari · iOS")).toBe(true);
  });

  it("чужие сеансы не видны, чужой сеанс не завершается (404)", async () => {
    const mine = await apiAs("anna").get<SessionsDTO>("/api/me/sessions");
    const maxim = await apiAs("maxim").get<SessionsDTO>("/api/me/sessions");
    const mineIds = new Set(mine.body.items.map((s) => s.id));
    expect(maxim.body.items.every((s) => !mineIds.has(s.id))).toBe(true);

    const foreign = mine.body.items[0]!.id;
    const del = await apiAs("maxim").delete(`/api/me/sessions/${foreign}`);
    expect(del.status).toBe(404);
    const still = await apiAs("anna").get<SessionsDTO>("/api/me/sessions");
    expect(still.body.items.some((s) => s.id === foreign)).toBe(true);
  });

  it("не UUID и гость", async () => {
    expect((await apiAs("anna").delete("/api/me/sessions/abc")).status).toBe(404);
    expect((await apiAs("guest").delete("/api/me/sessions/abc")).status).toBe(401);
    expect((await apiAs("elena").get("/api/me/sessions")).status).toBe(403);
  });

  it("завершить сеанс другого устройства", async () => {
    const list = await apiAs("anna").get<SessionsDTO>("/api/me/sessions");
    const other = list.body.items.find((s) => !s.current)!;
    expect((await apiAs("anna").delete(`/api/me/sessions/${other.id}`)).status).toBe(204);
    const after = await apiAs("anna").get<SessionsDTO>("/api/me/sessions");
    expect(after.body.items.some((s) => s.id === other.id)).toBe(false);
  });

  it("«выйти на всех»: второй контекст получает 401 (AC-11.2), чужие сеансы целы", async () => {
    const second = await signInWithAgent("anna", "203.0.113.11");
    const maximBefore = await apiAs("maxim").get<SessionsDTO>("/api/me/sessions");
    expect(
      await getAuth().api.getSession({ headers: new Headers({ cookie: second }) }),
    ).not.toBeNull();

    expect((await apiAs("anna").post("/api/me/sessions/revoke-all")).status).toBe(204);

    expect(await getAuth().api.getSession({ headers: new Headers({ cookie: second }) })).toBeNull();
    expect((await apiAs("anna").get("/api/me")).status).toBe(401);
    const maximAfter = await apiAs("maxim").get<SessionsDTO>("/api/me/sessions");
    expect(maximAfter.body.items.length).toBe(maximBefore.body.items.length);
    const [{ id }] = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, "anna.demo"));
    expect(await getDb().select().from(sessions).where(eq(sessions.userId, id))).toHaveLength(0);
  });
});

describe("экспорт данных", () => {
  it("только свои данные, файл JSON", async () => {
    const res = await apiAs("maxim").get<Record<string, unknown>>("/api/me/export");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.body).toHaveProperty("profile.login", "maxim.demo");
    expect(res.text).not.toContain("anna.demo");
    expect(res.text).not.toMatch(/password|token/i);
    expect((await apiAs("guest").get("/api/me/export")).status).toBe(401);
    expect((await apiAs("elena").get("/api/me/export")).status).toBe(403);
  });
});

describe("демо-сброс", () => {
  it("возвращает данные к исходным и не чаще раза в 5 минут", async () => {
    // Меняем данные Максима: имя в профиле.
    const patched = await apiAs("maxim").patch("/api/me", { displayName: "Испорчено" });
    expect(patched.status).toBe(200);

    const first = await apiAs("guest").post<DemoResetDTO>(
      "/api/demo/reset",
      {},
      { headers: { "x-real-ip": "203.0.113.50" } },
    );
    expect(first.status).toBe(200);
    expect(first.body.resetAt).toMatch(/^\d{4}-/);
    // Все сеансы закрыты, входим заново: данные исходные.
    const [row] = await getDb()
      .select({ n: users.username })
      .from(users)
      .where(eq(users.username, "maxim.demo"));
    expect(row?.n).toBe("maxim.demo");
    expect(await getDb().select().from(sessions)).toHaveLength(0);
    const cookie = await signInWithAgent("maxim", "203.0.113.51");
    expect(cookie).not.toBe("");

    const again = await apiAs("guest").post(
      "/api/demo/reset",
      {},
      { headers: { "x-real-ip": "203.0.113.52" } },
    );
    expect(again.status).toBe(429);
    expect(again.headers.get("retry-after")).toMatch(/^\d+$/);
    const sameIp = await apiAs("guest").post(
      "/api/demo/reset",
      {},
      { headers: { "x-real-ip": "203.0.113.50" } },
    );
    expect(sameIp.status).toBe(429);
  });

  it("запрос с чужого origin отклоняется", async () => {
    const res = await apiAs("guest").post(
      "/api/demo/reset",
      {},
      { headers: { origin: "https://evil.example", "x-real-ip": "203.0.113.60" } },
    );
    expect(res.status).toBe(403);
  });
});
