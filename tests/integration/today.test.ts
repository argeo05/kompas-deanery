import { beforeAll, describe, expect, it } from "vitest";
import type { AnnouncementDTO, Paged, ScheduleDTO, TodayDTO } from "@/contracts/api";
import { pickHero } from "@/lib/today";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { classes, deadlines, requests, scheduleChanges } from "@db/schema";
import type { Fixtures } from "../helpers/fixtures";
import { apiAs, countQueries, freezeTime, resetDb } from "../helpers/api";

// Интеграционные тесты агрегата главной «Сегодня» (DS-20).
//
// ГЕРОЙ ПРОВЕРЯЕТСЯ ЧЕРЕЗ САМ pickHero (DS-07): входные данные для hero собираем те же, что и
// сервис — classes и unseenChanges берём из ответа агрегата (это данные DS-11), а nextClassAt
// вычисляем по правилу сервиса из недельного расписания /api/me/schedule («первая не-отменённая
// пара с startsAt > now в окне 7 дней»). Если сервис и pickHero разойдутся — тест упадёт.
// Все ветки pickHero (change/now/soon/done_today/day_off) уже покрыты юнит-тестами
// tests/unit/today.test.ts; сид даёт ветки change (Аня) и day_off (Максим) — офф-кейсы не выдумываем.
//
// Время заморожено до сида: даты детерминированы (freezeTime("2026-11-12T12:00:00+03:00"), четверг).

const NOW = "2026-11-12T12:00:00+03:00"; // четверг
const DAY = "2026-11-12";
const WEEK_END = "2026-11-19"; // DAY + 7 дней
const HOT_MS = 48 * 60 * 60_000; // граница «важного», та же, что в DS-15
const NOW_MS = new Date(NOW).getTime();

let fx: Fixtures;
let macroClass = "";
let demoChangeId = "";

/** Правило сервиса nextClassAt (окно 7 дней): первая не-отменённая пара с startsAt > now. */
async function nextClassStart(actor: "anna" | "maxim"): Promise<string | null> {
  const res = await apiAs(actor).get<ScheduleDTO>(`/api/me/schedule?from=${DAY}&to=${WEEK_END}`);
  const next = res.body.classes.find(
    (c) => c.change?.type !== "cancelled" && new Date(c.startsAt).getTime() > NOW_MS,
  );
  return next?.startsAt ?? null;
}

/** Горячие дедлайны студента по формуле контракта: не сделал и dueAt ≤ now + 48 ч. */
async function hotDeadlinesOf(studentId: string) {
  return (
    await getDb()
      .select({
        id: deadlines.id,
        doneAt: deadlines.doneAt,
        dueAt: deadlines.dueAt,
        title: deadlines.title,
        source: deadlines.source,
        starred: deadlines.starred,
      })
      .from(deadlines)
      .where(eq(deadlines.studentId, studentId))
  ).filter((d) => d.doneAt === null && d.dueAt.getTime() <= NOW_MS + HOT_MS);
}

/** id заявки студента в статусе. */
async function requestIdOf(studentId: string, status: "ready" | "needs_info"): Promise<string> {
  const [row] = await getDb()
    .select({ id: requests.id })
    .from(requests)
    .where(and(eq(requests.studentId, studentId), eq(requests.status, status)))
    .limit(1);
  if (!row) throw new Error(`fixtures: нет заявки ${status} у ${studentId}`);
  return row.id;
}

const unseenOf = (dto: TodayDTO) =>
  dto.classes.flatMap((c) => (c.change && c.change.seen === false ? [c.change] : []));

beforeAll(async () => {
  freezeTime(NOW);
  fx = await resetDb();

  const [change] = await getDb()
    .select({ id: scheduleChanges.id, classId: classes.id, type: scheduleChanges.type })
    .from(scheduleChanges)
    .innerJoin(classes, eq(classes.id, scheduleChanges.classId))
    .where(eq(scheduleChanges.type, "moved"));
  if (!change) throw new Error("fixtures: в сиде нет демо-переноса");
  demoChangeId = change.id;
  macroClass = change.classId;
});

describe("GET /api/me/today — Аня (полный портрет дня)", () => {
  let anna: TodayDTO;
  let annaReadyRequestId = "";

  beforeAll(async () => {
    const res = await apiAs("anna").get<TodayDTO>("/api/me/today");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    anna = res.body;
    annaReadyRequestId = await requestIdOf(fx.users.anna, "ready");
  });

  it("ответ по контракту: now/dataAsOf — замороженное время, 12:00 — greeting day", () => {
    expect(anna.now).toBe(NOW);
    expect(anna.dataAsOf).toBe(NOW);
    expect(anna.greeting).toBe("day"); // 12:00 — начало «дня»
  });

  it("hero = pickHero на данных сервиса (демо-перенос: ветка change)", async () => {
    // те же входные данные, что и у сервиса: classes/unseenChanges — из ответа агрегата,
    // nextClassAt — по правилу сервиса из недельного расписания (СМ. КОММЕНТАРИЙ В ШАПКЕ)
    const heroExpected = pickHero(
      anna.now,
      anna.classes,
      unseenOf(anna),
      await nextClassStart("anna"),
    );
    expect(anna.hero).toEqual(heroExpected);
    // и конкретно сид-сценарий Ани: непросмотренный перенос важнее идущей пары (DS-07 п.1)
    expect(anna.hero.kind).toBe("change");
    if (anna.hero.kind === "change") {
      expect(anna.hero.classId).toBe(macroClass);
      expect(anna.hero.change).toMatchObject({ id: demoChangeId, type: "moved", seen: false });
    }
  });

  it("classes — 3 пары дня, отсортированы по времени; макро на новом месте (перенос)", () => {
    expect(anna.classes).toHaveLength(3);
    const startsAt = anna.classes.map((c) => c.startsAt);
    expect(startsAt).toEqual([...startsAt].sort());
    expect(startsAt).toEqual([
      "2026-11-12T09:30:00+03:00", // Микроэкономика
      "2026-11-12T11:10:00+03:00", // Английский
      "2026-11-12T15:20:00+03:00", // Макро (после переноса с 12:40)
    ]);
    expect(anna.classes.map((c) => c.id)).toContain(macroClass);
    expect(anna.classes.map((c) => c.note)).toEqual([null, null, null]);
  });

  it("passedCount — уже началось 2 пары (09:30 и 11:10 ≤ 12:00)", () => {
    expect(anna.passedCount).toBe(2);
  });

  it("hot — горячий дедлайн (≤48 ч) + готовая заявка, дедлайн первым, всего ≤ 3", async () => {
    const dbHot = await hotDeadlinesOf(fx.users.anna); // формула из БД
    expect(dbHot).toHaveLength(1); // эссе по макро через ~36 ч; личный (+4 дня) и админский (+9) не горят

    expect(anna.hot).toHaveLength(2);
    expect(anna.hot[0].kind).toBe("deadline");
    expect(anna.hot[1].kind).toBe("request");
    expect(anna.hot.length).toBeLessThanOrEqual(3); // SPEC §6.2
    if (anna.hot[0].kind === "deadline" && anna.hot[1].kind === "request") {
      const dto = anna.hot[0].deadline;
      expect(dto).toEqual({
        id: dbHot[0].id,
        source: dbHot[0].source, // assessment
        title: dbHot[0].title, // «Эссе по денежной политике»
        courseTitle: "Макроэкономика",
        dueAt: "2026-11-13T23:59:00+03:00",
        starred: dbHot[0].starred, // со звёздочкой
        done: false,
        risk: true, // не сделан и срок ≤ 48 ч
        plan: null, // плана нет
      });
      expect(anna.hot[1].request).toEqual(
        expect.objectContaining({
          id: annaReadyRequestId,
          status: "ready",
          type: { code: "scholarship_cert", title: "Справка о размере стипендии" },
          delivery: "original",
          copies: 2,
        }),
      );
    }
  });

  it("news — первые 2 объявления в порядке леты /api/me/announcements", async () => {
    const feed = await apiAs("anna").get<Paged<AnnouncementDTO>>("/api/me/announcements?limit=2");
    expect(anna.news).toHaveLength(2);
    expect(anna.news).toEqual(
      feed.body.items.map((a) => ({
        id: a.id,
        title: a.title,
        important: a.important,
        publishedAt: a.publishedAt,
      })),
    );
    for (const n of anna.news) {
      expect(n.id).toEqual(expect.any(String));
      expect(n.title).toEqual(expect.any(String));
      expect(n.important).toEqual(expect.any(Boolean));
      expect(n.publishedAt).toEqual(expect.any(String));
    }
  });
});

describe("GET /api/me/today — Максим (свои данные)", () => {
  let maxim: TodayDTO;

  beforeAll(async () => {
    const res = await apiAs("maxim").get<TodayDTO>("/api/me/today");
    expect(res.status).toBe(200);
    maxim = res.body;
  });

  it("hero = pickHero на данных сервиса (вечерние пары, до 19:00 далеко: day_off)", async () => {
    const heroExpected = pickHero(
      maxim.now,
      maxim.classes,
      unseenOf(maxim),
      await nextClassStart("maxim"),
    );
    expect(maxim.hero).toEqual(heroExpected);
    expect(maxim.hero.kind).toBe("day_off"); // ближайшая пара через 7 ч (> 3 ч, DS-07 п.4)
    if (maxim.hero.kind === "day_off") {
      expect(maxim.hero.nextClassAt).toBe("2026-11-12T19:00:00+03:00");
    }
  });

  it("classes — только его вечерние пары группы после 19:00, passedCount 0", () => {
    expect(maxim.classes).toHaveLength(2);
    for (const c of maxim.classes) {
      expect(c.startsAt >= "2026-11-12T19:00:00+03:00").toBe(true);
      expect(c.change).toBeNull();
    }
    expect(maxim.passedCount).toBe(0);
  });

  it("hot — только его заявка needs_info, дедлайнов нет, данных Ани нет", async () => {
    const dbHot = await hotDeadlinesOf(fx.users.maxim); // итоговый проект медиа — через 10 дней
    expect(dbHot).toHaveLength(0);

    const needsInfoId = await requestIdOf(fx.users.maxim, "needs_info");
    expect(maxim.hot).toHaveLength(1);
    expect(maxim.hot[0]).toEqual({
      kind: "request",
      request: expect.objectContaining({
        id: needsInfoId,
        status: "needs_info",
        type: { code: "transcript", title: "Выписка оценок (академическая справка)" },
      }),
    });
  });

  it("изоляция: пары и hot Максима не содержат данных Ани", async () => {
    const { body: annaToday } = await apiAs("anna").get<TodayDTO>("/api/me/today");
    const { body: maximToday } = await apiAs("maxim").get<TodayDTO>("/api/me/today");
    expect(maximToday.classes).toEqual(maxim.classes); // стабильно между вызовами

    const annaClassIds = annaToday.classes.map((a) => a.id);
    for (const c of maximToday.classes) {
      expect(annaClassIds).not.toContain(c.id);
    }

    const annaReadyId = await requestIdOf(fx.users.anna, "ready");
    const maximNeedsInfoId = await requestIdOf(fx.users.maxim, "needs_info");
    const maximRequestIds = maximToday.hot.flatMap((h) =>
      h.kind === "request" ? [h.request.id] : [],
    );
    expect(maximRequestIds).toEqual([maximNeedsInfoId]); // только его заявка
    expect(maximRequestIds).not.toContain(annaReadyId);

    const annaHotIds = annaToday.hot.map((h) =>
      h.kind === "deadline" ? h.deadline.id : h.request.id,
    );
    expect(annaHotIds).not.toContain(maximNeedsInfoId);
  });

  it("подмена studentId в query игнорируется: ответ равен своему", async () => {
    const own = await apiAs("maxim").get<TodayDTO>("/api/me/today");
    const injected = await apiAs("maxim").get<TodayDTO>(`/api/me/today?studentId=${fx.users.anna}`);
    expect(injected.status).toBe(200);
    expect(injected.body).toEqual(own.body);
  });

  it("гость → 401 UNAUTHORIZED, сотрудник → 403", async () => {
    const guest = await apiAs("guest").get("/api/me/today");
    expect(guest.status).toBe(401);
    expect(guest.body).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    expect((await apiAs("elena").get("/api/me/today")).status).toBe(403);
  });

  it("без N+1: ≤ 25 SQL-запросов на вызов, разница между пользователями ограничена", async () => {
    const first = await countQueries(() => apiAs("anna").get("/api/me/today"));
    const second = await countQueries(() => apiAs("maxim").get("/api/me/today"));
    expect(first.count).toBeLessThanOrEqual(25); // фактическое число фиксируем в отчёте тикета
    expect(second.count).toBeLessThanOrEqual(25);
    // Число запросов у пользователя константно (групповые запросы, без N+1): состав данных
    // Ани/Максима разный (пары, дедлайны, аудитория объявлений), но разница — константа.
    expect(Math.abs(first.count - second.count)).toBeLessThanOrEqual(5);
  });
});
