import { beforeAll, describe, expect, it } from "vitest";
import type { SearchDTO } from "@/contracts/api";
import { apiAs, freezeTime, resetDb } from "../helpers/api";

// Поиск (SPEC §6.10): AC-10.1 «военкомат» → первое действие, AC-10.2 опечатка находит дисциплину,
// AC-10.3 чужие объекты не попадают в выдачу. Время заморожено: пары «на ближайшие недели» детерминированы.

beforeAll(async () => {
  freezeTime("2026-11-12T12:00:00+03:00");
  await resetDb();
});

const find = (q: string, who: "anna" | "maxim" = "anna") =>
  apiAs(who).get<SearchDTO>(`/api/me/search?q=${encodeURIComponent(q)}`);

describe("поиск", () => {
  it("AC-10.1: «военкомат» первым даёт заявку на справку для военкомата", async () => {
    const res = await find("военкомат");
    expect(res.status).toBe(200);
    expect(res.body.groups[0]?.key).toBe("actions");
    expect(res.body.groups[0]?.hits[0]?.title).toMatch(/военкомат/i);
    expect(res.body.groups[0]?.hits[0]?.href).toMatch(/^\/requests\/new\//);
  });

  it("синоним: «стипуха» находит справку о стипендии", async () => {
    const res = await find("стипуха");
    expect(res.body.groups[0]?.hits.some((h) => /стипенд/i.test(h.title))).toBe(true);
  });

  it("AC-10.2: опечатка «макроэкномика» находит дисциплину", async () => {
    const res = await find("макроэкномика");
    const hits = res.body.groups.flatMap((g) => g.hits);
    expect(
      hits.some((h) => h.title === "Макроэкономика" && h.href.startsWith("/study/subjects/")),
    ).toBe(true);
  });

  it("справочник: «пересдать» находит статью", async () => {
    const res = await find("пересдать экзамен");
    expect(res.body.groups.find((g) => g.key === "kb")?.hits.length).toBeGreaterThan(0);
  });

  it("AC-10.3: дисциплина чужой группы не попадает в выдачу", async () => {
    const maxim = await find("медиааналитика", "maxim");
    const anna = await find("медиааналитика", "anna");
    expect(
      maxim.body.groups.flatMap((g) => g.hits).some((h) => /Медиааналитика/.test(h.title)),
    ).toBe(true);
    expect(
      anna.body.groups.flatMap((g) => g.hits).some((h) => /Медиааналитика/.test(h.title)),
    ).toBe(false);
  });

  it("короткий и пустой запрос отвергается, гость не ищет", async () => {
    expect((await find("а")).status).toBe(422);
    expect((await apiAs("guest").get("/api/me/search?q=справка")).status).toBe(401);
  });

  it("неизвестное слово — пустая выдача", async () => {
    expect((await find("ъъъъъъъ")).body.groups).toEqual([]);
  });
});
