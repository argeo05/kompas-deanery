import { beforeAll, describe, expect, it } from "vitest";
import type { ApiErrorBody, ScheduleDTO } from "@/contracts/api";
import { getDb } from "@/server/db";
import { classes, courses, scheduleChanges, studentProfiles } from "@db/schema";
import { and, eq, gte, lt } from "drizzle-orm";
import type { Fixtures } from "../helpers/fixtures";
import { apiAs, countQueries, freezeTime, resetDb } from "../helpers/api";

// Тесты расписания студента (DS-11): успешный ответ по контракту, перенос и «призрак»,
// валидация диапазона, заметка к паре, отметка изменений, изоляция «Максим не видит пары Ани».
// Время заморожено до сида — даты детерминированы (freezeTime("2026-11-12T12:00:00+03:00")).

const NOW = "2026-11-12T12:00:00+03:00"; // четверг
const DAY = "2026-11-12";
const MSK = "+03:00";

let fx: Fixtures;
let annaGroup = "";
let maximGroup = "";
let macroClass: string; // переносимая демо-пара (Макроэкономика, четверг 12:40)
let demoChangeId: string; // демо-перенос 12:40 → 15:20
let maximClass: string; // пара Максима — для проверки 404 на чужую пару

async function groupIdOf(userId: string): Promise<string> {
  const [row] = await getDb()
    .select({ groupId: studentProfiles.groupId })
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId));
  if (!row?.groupId) throw new Error(`fixtures: у пользователя ${userId} нет группы`);
  return row.groupId;
}

async function classesOfDay(groupId: string, dayStart: string, dayEnd: string) {
  return getDb()
    .select({ id: classes.id })
    .from(classes)
    .where(
      and(
        eq(classes.groupId, groupId),
        gte(classes.startsAt, new Date(`${dayStart}T00:00:00${MSK}`)),
        lt(classes.startsAt, new Date(`${dayEnd}T00:00:00${MSK}`)),
      ),
    );
}

beforeAll(async () => {
  freezeTime(NOW);
  fx = await resetDb();

  annaGroup = await groupIdOf(fx.users.anna);
  maximGroup = await groupIdOf(fx.users.maxim);

  const [macro] = await getDb()
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.title, "Макроэкономика"));
  const macroRows = await getDb()
    .select({ id: classes.id })
    .from(classes)
    .where(
      and(
        eq(classes.groupId, annaGroup),
        eq(classes.courseId, macro.id),
        gte(classes.startsAt, new Date(`${DAY}T00:00:00${MSK}`)),
        lt(classes.startsAt, new Date(`2026-11-13T00:00:00${MSK}`)),
      ),
    );
  expect(macroRows).toHaveLength(1);
  macroClass = macroRows[0].id;

  const [change] = await getDb()
    .select({ id: scheduleChanges.id })
    .from(scheduleChanges)
    .innerJoin(classes, eq(classes.id, scheduleChanges.classId))
    .where(eq(scheduleChanges.type, "moved"));
  if (!change) throw new Error("fixtures: в сиде нет демо-переноса");
  demoChangeId = change.id;

  const maximRows = await classesOfDay(maximGroup, DAY, "2026-11-13");
  if (maximRows.length === 0) throw new Error("fixtures: у Максима нет пар в четверг");
  maximClass = maximRows[0].id;
});

describe("GET /api/me/schedule", () => {
  it("возвращает пары дня по контракту, перенос применён, призрак на старом месте", async () => {
    const res = await apiAs("anna").get<ScheduleDTO>(`/api/me/schedule?from=${DAY}&to=${DAY}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.body.from).toBe(DAY);
    expect(res.body.to).toBe(DAY);
    expect(res.body.weekNumber).toBe(46);
    expect(res.body.weekParity).toBe("even");
    expect(res.body.classes).toEqual([
      {
        id: expect.any(String),
        course: {
          id: expect.any(String),
          title: "Микроэкономика",
          shortTitle: "Микро",
          colorIndex: 2,
        },
        type: "lecture",
        startsAt: `2026-11-12T09:30:00${MSK}`,
        endsAt: `2026-11-12T10:50:00${MSK}`,
        room: {
          id: expect.any(String),
          building: "А",
          number: "214",
          floor: 2,
          hint: null,
        },
        teacher: {
          id: expect.any(String),
          fullName: "Кравцова Ирина Олеговна",
          email: "kravtsova.i@example.edu",
          officeHours: "Ср 15:00–16:30, ауд. 214",
        },
        weekParity: null,
        change: null,
        note: null,
      },
      {
        id: expect.any(String),
        course: {
          id: expect.any(String),
          title: "Английский язык",
          shortTitle: "Англ.",
          colorIndex: 5,
        },
        type: "practice",
        startsAt: `2026-11-12T11:10:00${MSK}`,
        endsAt: `2026-11-12T12:30:00${MSK}`,
        room: { id: expect.any(String), building: "Б", number: "312", floor: 3, hint: null },
        teacher: {
          id: expect.any(String),
          fullName: "Уилсон Анна Робертовна",
          email: "wilson.a@example.edu",
          officeHours: null,
        },
        weekParity: null,
        change: null,
        note: null,
      },
      {
        id: macroClass,
        course: {
          id: expect.any(String),
          title: "Макроэкономика",
          shortTitle: "Макро",
          colorIndex: 1,
        },
        type: "seminar",
        startsAt: `2026-11-12T15:20:00${MSK}`, // перенесена с 12:40
        endsAt: `2026-11-12T16:40:00${MSK}`,
        room: {
          id: expect.any(String),
          building: "А",
          number: "4012",
          floor: 4,
          hint: "Направо от лифта",
        },
        teacher: {
          id: expect.any(String),
          fullName: "Петров Андрей Викторович",
          email: "petrov.a@example.edu",
          officeHours: "Пн 14:10–15:30, ауд. 4010",
        },
        weekParity: null,
        change: {
          id: demoChangeId,
          type: "moved",
          previous: {
            startsAt: `2026-11-12T12:40:00${MSK}`,
            endsAt: `2026-11-12T14:00:00${MSK}`,
            roomNumber: "4012",
          },
          reason: "Преподаватель на конференции утром",
          createdAt: "2026-11-11T18:00:00+03:00",
          seen: false,
        },
        note: null,
      },
    ]);
    expect(res.body.ghostSlots).toEqual([
      {
        classId: macroClass,
        originalStartsAt: `2026-11-12T12:40:00${MSK}`,
        movedTo: `2026-11-12T15:20:00${MSK}`,
      },
    ]);
  });

  it("по умолчанию — текущая неделя пн–вс МСК, пары отсортированы по времени", async () => {
    const res = await apiAs("anna").get<ScheduleDTO>("/api/me/schedule");
    expect(res.status).toBe(200);
    expect(res.body.from).toBe("2026-11-09");
    expect(res.body.to).toBe("2026-11-15");
    const startsAt = res.body.classes.map((c) => c.startsAt);
    expect(startsAt).toEqual([...startsAt].sort());
    expect(startsAt[0]).toBe(`2026-11-09T09:30:00${MSK}`); // понедельник
    // Аня: пн 3, вт 2, ср 3, чт 3, пт 2, сб 2 = 15 пар
    expect(res.body.classes).toHaveLength(15);
  });

  it("перенос за пределы диапазона не ломает выдачу: изменённая пара показывается на новом месте", async () => {
    // Четверг с парой пик имеет перенос; день без переноса — без ghosts.
    const monday = await apiAs("anna").get<ScheduleDTO>(
      `/api/me/schedule?from=2026-11-09&to=2026-11-09`,
    );
    expect(monday.body.ghostSlots).toEqual([]);
    expect(monday.body.classes).toHaveLength(3);
  });

  it("в воскресенье пар нет: пустой список без призраков", async () => {
    const res = await apiAs("anna").get<ScheduleDTO>(
      `/api/me/schedule?from=2026-11-15&to=2026-11-15`,
    );
    expect(res.body.classes).toEqual([]);
    expect(res.body.ghostSlots).toEqual([]);
  });

  it("from больше to → 422; диапазон больше 31 дня → 422 с путём поля", async () => {
    const swapped = await apiAs("anna").get<ApiErrorBody>(
      `/api/me/schedule?from=2026-11-13&to=2026-11-12`,
    );
    expect(swapped.status).toBe(422);
    expect(swapped.body.error.code).toBe("VALIDATION");
    expect(swapped.body.error.details).toEqual({
      issues: [{ path: "from", code: "invalid_range" }],
    });

    const tooLong = await apiAs("anna").get<ApiErrorBody>(
      `/api/me/schedule?from=2026-11-01&to=2026-12-02`,
    );
    expect(tooLong.status).toBe(422);
    expect(tooLong.body.error.details).toEqual({
      issues: [{ path: "to", code: "range_too_long" }],
    });

    const badDate = await apiAs("anna").get<ApiErrorBody>(
      `/api/me/schedule?from=2026-99-99&to=2026-12-01`,
    );
    expect(badDate.status).toBe(422);
    expect(badDate.body.error.details).toEqual({
      issues: [{ path: "from", code: "invalid_date" }],
    });
    const badFeb = await apiAs("anna").get<ApiErrorBody>(
      `/api/me/schedule?from=2026-11-01&to=2026-02-30`,
    );
    expect(badFeb.status).toBe(422);
    expect(badFeb.body.error.details).toEqual({
      issues: [{ path: "to", code: "invalid_date" }],
    });

    const boundary = await apiAs("anna").get<ScheduleDTO>(
      `/api/me/schedule?from=2026-11-01&to=2026-12-01`,
    );
    expect(boundary.status).toBe(200); // ровно 31 день — допустимо
  });

  it("без N+1: число запросов не зависит от ширины диапазона", async () => {
    const small = await countQueries(() =>
      apiAs("anna").get(`/api/me/schedule?from=${DAY}&to=${DAY}`),
    );
    const large = await countQueries(() =>
      apiAs("anna").get(`/api/me/schedule?from=2026-11-01&to=2026-12-01`),
    );
    expect(large.count).toBe(small.count);
  });

  it("Максим не видит пары Ани, даже подставив её studentId", async () => {
    const own = await apiAs("maxim").get<ScheduleDTO>(`/api/me/schedule?from=${DAY}&to=${DAY}`);
    const injected = await apiAs("maxim").get<ScheduleDTO>(
      `/api/me/schedule?from=${DAY}&to=${DAY}&studentId=${fx.users.anna}`,
    );
    expect(injected.status).toBe(200);
    expect(injected.body).toEqual(own.body);

    const annaIds = (await classesOfDay(annaGroup, DAY, "2026-11-13")).map((r) => r.id);
    const maximIds = (await classesOfDay(maximGroup, DAY, "2026-11-13")).map((r) => r.id);
    // Максим в четверг: 2 пары Digital Communications (вечер), ни одной пары Ани.
    expect(own.body.classes.length).toBe(2);
    for (const c of own.body.classes) {
      expect(maximIds).toContain(c.id);
      expect(annaIds).not.toContain(c.id);
    }
    expect(own.body.ghostSlots).toEqual([]);
  });

  it("гость → 401, сотрудник → 403", async () => {
    expect((await apiAs("guest").get("/api/me/schedule")).status).toBe(401);
    expect((await apiAs("elena").get("/api/me/schedule")).status).toBe(403);
  });
});

describe("PUT /api/me/classes/:classId/note", () => {
  it("создаёт заметку и меняет на новую", async () => {
    const created = await apiAs("anna").put<{ note: string }>(
      `/api/me/classes/${macroClass}/note`,
      { text: "Взять калькулятор" },
    );
    expect(created.status).toBe(200);
    expect(created.headers.get("cache-control")).toBe("no-store");
    expect(created.body.note).toBe("Взять калькулятор");

    const inSchedule = await apiAs("anna").get<ScheduleDTO>(
      `/api/me/schedule?from=${DAY}&to=${DAY}`,
    );
    expect(inSchedule.body.classes.find((c) => c.id === macroClass)?.note).toBe(
      "Взять калькулятор",
    );

    const updated = await apiAs("anna").put<{ note: string }>(
      `/api/me/classes/${macroClass}/note`,
      { text: "Не забыть конспект" },
    );
    expect(updated.body.note).toBe("Не забыть конспект");
  });

  it("обрезает пробелы, пустая строка и одни пробелы удаляют заметку", async () => {
    const trimmed = await apiAs("anna").put<{ note: string }>(
      `/api/me/classes/${macroClass}/note`,
      { text: "  Взять калькулятор  " },
    );
    expect(trimmed.body.note).toBe("Взять калькулятор");

    const deleted = await apiAs("anna").put<{ note: string | null }>(
      `/api/me/classes/${macroClass}/note`,
      { text: "" },
    );
    expect(deleted.status).toBe(200);
    expect(deleted.body.note).toBeNull();

    const whitespace = await apiAs("anna").put<{ note: string | null }>(
      `/api/me/classes/${macroClass}/note`,
      { text: "   " },
    );
    expect(whitespace.body.note).toBeNull();

    const inSchedule = await apiAs("anna").get<ScheduleDTO>(
      `/api/me/schedule?from=${DAY}&to=${DAY}`,
    );
    expect(inSchedule.body.classes.find((c) => c.id === macroClass)?.note).toBeNull();
  });

  it("текст длиннее 500 символов → 422; чужая и несуществующая пара, кривой id → 404", async () => {
    const tooLong = await apiAs("anna").put<ApiErrorBody>(
      "/api/me/classes/" + macroClass + "/note",
      {
        text: "а".repeat(501),
      },
    );
    expect(tooLong.status).toBe(422);
    expect(tooLong.body.error.code).toBe("VALIDATION");

    const foreign = await apiAs("anna").put<ApiErrorBody>(`/api/me/classes/${maximClass}/note`, {
      text: "Чужая пара",
    });
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("NOT_FOUND");

    const missing = await apiAs("anna").put<ApiErrorBody>(
      "/api/me/classes/" + crypto.randomUUID() + "/note",
      {
        text: "Нет такой пары",
      },
    );
    expect(missing.status).toBe(404);

    const malformed = await apiAs("anna").put<ApiErrorBody>("/api/me/classes/not-a-uuid/note", {
      text: "Кривой id",
    });
    expect(malformed.status).toBe(404);
  });

  it("гость → 401, сотрудник → 403", async () => {
    expect(
      (await apiAs("guest").put(`/api/me/classes/${macroClass}/note`, { text: "x" })).status,
    ).toBe(401);
    expect(
      (await apiAs("elena").put(`/api/me/classes/${macroClass}/note`, { text: "x" })).status,
    ).toBe(403);
  });
});

describe("POST /api/me/schedule/changes/seen", () => {
  it("204, после чего change.seen = true; повтор — тоже 204", async () => {
    const seen = async () => {
      const res = await apiAs("anna").get<ScheduleDTO>(`/api/me/schedule?from=${DAY}&to=${DAY}`);
      return res.body.classes.find((c) => c.id === macroClass)?.change?.seen;
    };
    expect(await seen()).toBe(false);

    const first = await apiAs("anna").post(`/api/me/schedule/changes/seen`, {
      changeIds: [demoChangeId],
    });
    expect(first.status).toBe(204);
    expect(first.text).toBe("");
    expect(await seen()).toBe(true);

    const repeat = await apiAs("anna").post(`/api/me/schedule/changes/seen`, {
      changeIds: [demoChangeId],
    });
    expect(repeat.status).toBe(204);
  });

  it("чужой id молча отбрасывается: Максим не может «увидеть» изменение Ани", async () => {
    const foreign = await apiAs("maxim").post(`/api/me/schedule/changes/seen`, {
      changeIds: [demoChangeId, crypto.randomUUID()],
    });
    expect(foreign.status).toBe(204);
    const res = await apiAs("maxim").get<ScheduleDTO>(`/api/me/schedule?from=${DAY}&to=${DAY}`);
    expect(res.body.classes.every((c) => c.change === null)).toBe(true);
  });

  it("пустой список и 51 id → 422", async () => {
    const empty = await apiAs("anna").post<ApiErrorBody>(`/api/me/schedule/changes/seen`, {
      changeIds: [],
    });
    expect(empty.status).toBe(422);

    const ids = [demoChangeId, ...Array.from({ length: 50 }, () => crypto.randomUUID())];
    expect(ids).toHaveLength(51);
    const fiftyOne = await apiAs("anna").post<ApiErrorBody>(`/api/me/schedule/changes/seen`, {
      changeIds: ids,
    });
    expect(fiftyOne.status).toBe(422);
    expect(fiftyOne.body.error.code).toBe("VALIDATION");
  });

  it("гость → 401, сотрудник → 403", async () => {
    expect(
      (
        await apiAs("guest").post(`/api/me/schedule/changes/seen`, {
          changeIds: [crypto.randomUUID()],
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await apiAs("elena").post(`/api/me/schedule/changes/seen`, {
          changeIds: [crypto.randomUUID()],
        })
      ).status,
    ).toBe(403);
  });
});
