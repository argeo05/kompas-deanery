import { beforeAll, describe, expect, it } from "vitest";
import type { Paged, RequestDTO, SearchDTO } from "@/contracts/api";
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

  // C11, раунд 1: поиск показывал перенесённую пару по старому времени.
  it("перенесённая пара — по новому времени и с меткой переноса", async () => {
    const res = await find("макро");
    const hits = res.body.groups.find((g) => g.key === "schedule")?.hits ?? [];
    const today = hits.filter((h) => /^Макро, сегодня в /.test(h.title));
    expect(today.map((h) => h.title)).toContain("Макро, сегодня в 15:20");
    expect(today.map((h) => h.title)).not.toContain("Макро, сегодня в 12:40");
    const moved = today.find((h) => h.title === "Макро, сегодня в 15:20");
    expect(moved?.hint).toBe("Перенесена, было 12:40 · ауд. 4012");
  });

  // C11: подсказка в шапке «пары, заявки, дедлайны» — дедлайны и заявки находятся.
  it("свои дедлайны находятся по названию", async () => {
    const res = await find("эссе");
    const hits = res.body.groups.find((g) => g.key === "deadlines")?.hits ?? [];
    expect(hits.some((h) => h.title === "Эссе по денежной политике")).toBe(true);
    expect(hits.every((h) => h.href.startsWith("/study/deadlines#d-"))).toBe(true);
  });

  it("свои заявки находятся по номеру; чужой номер не находится (AC-10.3)", async () => {
    const mine = await apiAs("anna").get<Paged<RequestDTO>>("/api/me/requests?tab=all");
    const r = mine.body.items[0]!;
    const res = await find(r.number);
    const hits = res.body.groups.find((g) => g.key === "requests")?.hits ?? [];
    expect(hits[0]).toMatchObject({ id: r.id, href: `/requests/${r.id}` });
    expect(hits[0]?.title).toContain(r.number);

    const maxim = await find(r.number, "maxim");
    expect(maxim.body.groups.flatMap((g) => g.hits).some((h) => h.id === r.id)).toBe(false);
  });

  it("короткий и пустой запрос отвергается, гость не ищет", async () => {
    expect((await find("а")).status).toBe(422);
    expect((await apiAs("guest").get("/api/me/search?q=справка")).status).toBe(401);
  });

  it("неизвестное слово — пустая выдача", async () => {
    expect((await find("ъъъъъъъ")).body.groups).toEqual([]);
  });
});
