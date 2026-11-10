import { beforeAll, describe, expect, it } from "vitest";
import ICAL from "ical.js";
import type { ApiErrorBody, IcsUrlDTO } from "@/contracts/api";
import { getDb } from "@/server/db";
import { classes, deadlines, enrollments, studentProfiles } from "@db/schema";
import { and, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import type { Fixtures } from "../helpers/fixtures";
import { apiAs, freezeTime, resetDb } from "../helpers/api";

// Тесты календаря ICS (DS-22): идемпотентная ссылка и сброс токена, валидный корм
// (парсер ical.js, число событий = парам в ±4 недели + starred-дедлайнам), 404 на
// неверные токены, лимит 60 запросов в час за токен, изоляция «в корме Ани нет пар Максима».
// Время заморожено до сида — даты детерминированы (freezeTime("2026-11-12T12:00:00+03:00")).

const NOW = "2026-11-12T12:00:00+03:00"; // четверг
const WINDOW_MS = 28 * 24 * 3600_000; // ±4 недели (DS-22)
const START = new Date(new Date(NOW).getTime() - WINDOW_MS);
const END = new Date(new Date(NOW).getTime() + WINDOW_MS);

let fx: Fixtures;
let annaGroup = "";

/** Разобрать строку календаря в список VEVENT (проверка валидности файла — AC-3.4). */
function vevents(calendar: string) {
  const root = new ICAL.Component(ICAL.parse(calendar));
  return root.getAllSubcomponents("vevent");
}

beforeAll(async () => {
  freezeTime(NOW);
  fx = await resetDb();
  const [profile] = await getDb()
    .select({ groupId: studentProfiles.groupId })
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, fx.users.anna));
  if (!profile?.groupId) throw new Error("fixtures: у Ани нет группы");
  annaGroup = profile.groupId;
});

/** Ожидаемое число событий корма Ани: пары (группа + потоковые его курсов) ±4 недели + starred. */
async function expectedAnnaEventCount(): Promise<number> {
  const enrollIds = (
    await getDb()
      .select({ courseId: enrollments.courseId })
      .from(enrollments)
      .where(eq(enrollments.studentId, fx.users.anna))
  ).map((row) => row.courseId);
  const mine =
    enrollIds.length === 0
      ? eq(classes.groupId, annaGroup)
      : or(
          eq(classes.groupId, annaGroup),
          and(inArray(classes.courseId, enrollIds), isNull(classes.groupId)),
        );
  const classCount = (
    await getDb()
      .select({ id: classes.id })
      .from(classes)
      .where(and(mine, gte(classes.startsAt, START), lt(classes.startsAt, END)))
  ).length;
  const starredCount = (
    await getDb()
      .select({ id: deadlines.id })
      .from(deadlines)
      .where(and(eq(deadlines.studentId, fx.users.anna), eq(deadlines.starred, true)))
  ).length;
  return classCount + starredCount;
}

describe("GET /api/me/ics и POST /api/me/ics/rotate", () => {
  it("первый GET создаёт ссылку, повторный возвращает ту же (идемпотентно)", async () => {
    const first = await apiAs("anna").get<IcsUrlDTO>("/api/me/ics");
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    // Относительный url без origin: /api/ics/<256-битный токен>.ics
    expect(first.body.url).toMatch(/^\/api\/ics\/[A-Za-z0-9_-]{43}\.ics$/);

    const second = await apiAs("anna").get<IcsUrlDTO>("/api/me/ics");
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
  });

  it("rotate выдаёт новый токен, старый перестаёт работать (404), будущий GET — уже новый", async () => {
    const before = await apiAs("anna").get<IcsUrlDTO>("/api/me/ics");

    const rotated = await apiAs("anna").post<IcsUrlDTO>("/api/me/ics/rotate", undefined);
    expect(rotated.status).toBe(200);
    expect(rotated.body.url).toMatch(/^\/api\/ics\/[A-Za-z0-9_-]{43}\.ics$/);
    expect(rotated.body.url).not.toBe(before.body.url);

    const oldToken = before.body.url.replace(/^\/api\/ics\//, "");
    const oldFeed = await apiAs("guest").get<ApiErrorBody>(`/api/ics/${oldToken}`);
    expect(oldFeed.status).toBe(404);
    expect(oldFeed.body.error.code).toBe("NOT_FOUND");

    const after = await apiAs("anna").get<IcsUrlDTO>("/api/me/ics");
    expect(after.body).toEqual(rotated.body);
  });

  it("гость → 401, сотрудник → 403", async () => {
    expect((await apiAs("guest").get("/api/me/ics")).status).toBe(401);
    expect((await apiAs("guest").post("/api/me/ics/rotate")).status).toBe(401);
    expect((await apiAs("elena").get("/api/me/ics")).status).toBe(403);
    expect((await apiAs("elena").post("/api/me/ics/rotate")).status).toBe(403);
  });
});

describe("GET /api/ics/:token.ics", () => {
  it("отдаёт валидный календарь: число событий = парам ±4 недели + starred-дедлайнам", async () => {
    const url = (await apiAs("anna").get<IcsUrlDTO>("/api/me/ics")).body.url;
    const res = await apiAs("guest").get<string>(url);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");

    const events = vevents(res.text);
    expect(events).toHaveLength(await expectedAnnaEventCount());

    // UID на месте: class-<uuid>@kompas / deadline-<uuid>@kompas.
    const uids = events.map((event) => String(event.getFirstPropertyValue("uid")));
    expect(uids.length).toBeGreaterThan(0);
    for (const uid of uids) expect(uid).toMatch(/^(class|deadline)-[0-9a-f-]{36}@kompas$/);
    expect(uids.some((uid) => uid.startsWith("deadline-"))).toBe(true);

    // Пары: SUMMARY вида «<курс> (<type>)», у Ани есть и Макро (seminar) — переносимая демо-пара.
    const summaries = events.map((event) => String(event.getFirstPropertyValue("summary")));
    expect(summaries.some((summary) => summary === "Макро (семинар)")).toBe(true);
    // Дедлайн со звёздочкой: «Дедлайн: Эссе по денежной политике».
    expect(summaries).toContain("Дедлайн: Эссе по денежной политике");
  });

  it("изоляция: в корме Ани нет курсов Максима, в корме Максима — курсов Ани", async () => {
    const annaUrl = (await apiAs("anna").get<IcsUrlDTO>("/api/me/ics")).body.url;
    const annaRes = await apiAs("guest").get<string>(annaUrl);
    const annaSummaries = vevents(annaRes.text).map((event) =>
      String(event.getFirstPropertyValue("summary")),
    );
    expect(annaSummaries.length).toBeGreaterThan(0);
    for (const summary of annaSummaries) {
      expect(summary.startsWith("Медиа")).toBe(false);
      expect(summary.startsWith("Цифр")).toBe(false);
    }

    const maximUrl = (await apiAs("maxim").get<IcsUrlDTO>("/api/me/ics")).body.url;
    const maximRes = await apiAs("guest").get<string>(maximUrl);
    const maximSummaries = vevents(maximRes.text).map((event) =>
      String(event.getFirstPropertyValue("summary")),
    );
    expect(maximSummaries.length).toBeGreaterThan(0);
    // У Максима нет starred-дедлайнов — дедлайн-событий в его корме не должно быть.
    expect(maximSummaries.some((summary) => summary.startsWith("Дедлайн"))).toBe(false);
    for (const summary of maximSummaries) {
      expect(summary.includes("Микро")).toBe(false);
      expect(summary.includes("Макро")).toBe(false);
      expect(summary.includes("Англ")).toBe(false);
    }
  });

  it("неверный токен → 404 NOT_FOUND (в т.ч. мусор и подмена суффикса)", async () => {
    const zeros = await apiAs("guest").get<ApiErrorBody>(`/api/ics/${"0".repeat(64)}.ics`);
    expect(zeros.status).toBe(404);
    expect(zeros.body.error.code).toBe("NOT_FOUND");

    const garbage = await apiAs("guest").get<ApiErrorBody>("/api/ics/not-a-real-token.ics");
    expect(garbage.status).toBe(404);

    const empty = await apiAs("guest").get<ApiErrorBody>("/api/ics/.ics");
    expect(empty.status).toBe(404);
  });

  it("61-й запрос за час на токен → 429 RATE_LIMITED, счёт ведётся на каждый токен заново", async () => {
    // Свежий токен — новая ячейка лимитера (ключ «на токен»), другие тесты не мешают.
    const url = (await apiAs("anna").post<IcsUrlDTO>("/api/me/ics/rotate", undefined)).body.url;

    const statuses: number[] = [];
    for (let i = 1; i <= 61; i++) {
      statuses.push((await apiAs("guest").get(url)).status);
    }
    for (const status of statuses.slice(0, 60)) expect(status).toBe(200);
    expect(statuses[60]).toBe(429);
    const limited = await apiAs("guest").get<ApiErrorBody>(url);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");

    // Другой токен студента лимит не наследует: rotate — и снова 200.
    const fresh = (await apiAs("anna").post<IcsUrlDTO>("/api/me/ics/rotate", undefined)).body.url;
    expect((await apiAs("guest").get(fresh)).status).toBe(200);
  });
});
