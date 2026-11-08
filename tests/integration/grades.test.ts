import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import type { ApiErrorBody, CourseGradesDTO, GradesDTO } from "@/contracts/api";
import { getDb } from "@/server/db";
import { assessments, courses } from "@db/schema";
import { apiAs, countQueries, freezeTime, resetDb } from "../helpers/api";
import type { Fixtures } from "../helpers/fixtures";

// Тесты успеваемости студента (DEEPSEEK-TASKS §4, DS-12 и DS-13) по образцу эталона
// tests/integration/me-requests.test.ts: успешный ответ, валидация, изоляция «Максим не видит Аню».
// Время заморожено до сида — все даты детерминированы (SPEC §11.3).

const NOW = "2026-11-12T12:00:00+03:00"; // четверг

// Ожидания из сида (db/seed/demo-accounts.ts), отсчитанные от замороженного «сегодня»:
// Аня: Микро сдано 11,5/50 → риск NEED_OVER_70; Макро 24/30; Англ 36/40. Среднее 23,8.
// Максим: Медиа 51/60; Цифр. ком. 34/40. Среднее 42,5. Сессия: Аня +22 дня, Максим +25.
// Контрольная 1 Ани: первая оценка 1 исправлена на 2 (grade_history).

interface GradesFx {
  courses: Record<"micro" | "macro" | "english" | "media" | "digitalComm", string>;
  microQuiz1: string;
}

async function loadGradesFx(): Promise<GradesFx> {
  const db = getDb();
  const titles = [
    "Микроэкономика",
    "Макроэкономика",
    "Английский язык",
    "Медиааналитика",
    "Цифровые коммуникации",
  ];
  const rows = await db
    .select({ id: courses.id, title: courses.title })
    .from(courses)
    .where(inArray(courses.title, titles));
  const byTitle = new Map(rows.map((r) => [r.title, r.id]));
  const courseId = (title: string) => {
    const id = byTitle.get(title);
    if (!id) throw new Error(`grades.test: нет курса «${title}» в сиде`);
    return id;
  };
  const micro = courseId("Микроэкономика");
  const [quiz1] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(and(eq(assessments.courseId, micro), eq(assessments.title, "Контрольная 1")));
  if (!quiz1) throw new Error("grades.test: нет элемента «Контрольная 1»");
  return {
    courses: {
      micro,
      macro: courseId("Макроэкономика"),
      english: courseId("Английский язык"),
      media: courseId("Медиааналитика"),
      digitalComm: courseId("Цифровые коммуникации"),
    },
    microQuiz1: quiz1.id,
  };
}

let fx: GradesFx;
let dbFx: Fixtures;
beforeAll(async () => {
  freezeTime(NOW);
  dbFx = await resetDb();
  fx = await loadGradesFx();
});

describe("GET /api/me/grades", () => {
  it("Аня: сводка семестра, риск по Микроэкономике — сдано 11,5 из 50", async () => {
    const res = await apiAs("anna").get<GradesDTO>("/api/me/grades?semester=2026-1");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.body).toMatchObject({
      semester: "2026-1",
      semesters: ["2026-1"],
      status: {
        status: "risk",
        reasons: [{ courseId: fx.courses.micro, reason: "NEED_OVER_70" }],
      },
      averagePreliminary: 23.8,
      daysToSession: 22,
    });
    // Риски первыми (SPEC §6.4 п.2), дальше по названию.
    expect(res.body.courses.map((c) => c.title)).toEqual([
      "Микроэкономика",
      "Английский язык",
      "Макроэкономика",
    ]);
    expect(res.body.courses[0]).toEqual({
      courseId: fx.courses.micro,
      title: "Микроэкономика",
      control: "exam",
      total: 11.5,
      maxSoFar: 50,
      mark: null, // экзамен не сдан — оценки ещё нет
      credit: null,
      risk: true,
    });
    const english = res.body.courses[1]!;
    expect(english).toMatchObject({
      title: "Английский язык",
      control: "credit",
      total: 36,
      maxSoFar: 40,
      mark: null,
      risk: false,
      credit: {
        passed: null,
        conditions: [
          { label: "Тест", met: true },
          { label: "Проект", met: false },
        ],
      },
    });
    expect(res.body.courses[2]).toMatchObject({
      title: "Макроэкономика",
      total: 24,
      maxSoFar: 30,
      mark: null,
      credit: null,
      risk: false,
    });
  });

  it("Максим: всё в порядке, список — только его дисциплины", async () => {
    const res = await apiAs("maxim").get<GradesDTO>("/api/me/grades?semester=2026-1");
    expect(res.status).toBe(200);
    expect(res.body.status).toEqual({ status: "ok", reasons: [] });
    expect(res.body.semesters).toEqual(["2026-1"]);
    expect(res.body.averagePreliminary).toBe(42.5);
    expect(res.body.daysToSession).toBe(25);
    expect(res.body.courses.map((c) => c.courseId)).toEqual([
      fx.courses.media,
      fx.courses.digitalComm,
    ]);
    expect(res.body.courses[0]).toMatchObject({
      title: "Медиааналитика",
      control: "graded_credit",
      total: 51,
      maxSoFar: 60,
      mark: null,
      credit: null,
      risk: false,
    });
    expect(res.body.courses[1]).toMatchObject({
      title: "Цифровые коммуникации",
      total: 34,
      maxSoFar: 40,
      risk: false,
    });
  });

  it("без semester — последний доступный семестр студента", async () => {
    const res = await apiAs("anna").get<GradesDTO>("/api/me/grades");
    expect(res.status).toBe(200);
    expect(res.body.semester).toBe("2026-1");
  });

  it("несуществующий семестр → 404 NOT_FOUND", async () => {
    const res = await apiAs("anna").get<ApiErrorBody>("/api/me/grades?semester=2025-1");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND" } });
  });

  it("невалидный формат semester → 422 VALIDATION с путём поля", async () => {
    for (const bad of ["", "26-1", "2026_1", "2026-1x", "1-2026"]) {
      const res = await apiAs("anna").get<ApiErrorBody>(
        `/api/me/grades?semester=${encodeURIComponent(bad)}`,
      );
      expect(res.status, bad).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION");
      const issues = (res.body.error.details as { issues: Array<{ path: string }> }).issues;
      expect(issues.map((i) => i.path)).toContain("semester");
    }
  });

  it("Максим не видит дисциплины Ани, даже если подставить её studentId", async () => {
    const res = await apiAs("maxim").get<GradesDTO>(`/api/me/grades?studentId=${dbFx.users.anna}`);
    expect(res.status).toBe(200);
    expect(res.body.courses.map((c) => c.courseId)).toEqual([
      fx.courses.media,
      fx.courses.digitalComm,
    ]);
  });

  it("гость → 401, сотрудник → 403", async () => {
    expect((await apiAs("guest").get("/api/me/grades")).status).toBe(401);
    expect((await apiAs("elena").get("/api/me/grades")).status).toBe(403);
  });

  it("без N+1: число запросов фиксированное", async () => {
    const { count } = await countQueries(() => apiAs("anna").get("/api/me/grades?semester=2026-1"));
    // сессия + профиль (guard) + set_config + SET ROLE + семестры + курсы + оценки + итоги + экзамены + допуски
    expect(count).toBeLessThanOrEqual(14);
  });
});

describe("GET /api/me/grades/:courseId", () => {
  it("дисциплина Ани: элементы, история исправления оценки, калькулятор целей", async () => {
    const res = await apiAs("anna").get<CourseGradesDTO>(`/api/me/grades/${fx.courses.micro}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.body).toMatchObject({
      courseId: fx.courses.micro,
      title: "Микроэкономика",
      control: "exam",
      rulesText: "Две контрольные, эссе и экзамен. Экзамен — половина итога.",
      teacher: {
        fullName: "Кравцова Ирина Олеговна",
        email: "kravtsova.i@example.edu",
        officeHours: "Ср 15:00–16:30, ауд. 214",
      },
      total: 11.5,
      mark: null,
      peerGoal: null,
    });
    // Элементы по сроку: несостоявшийся экзамен — последним.
    expect(res.body.items.map((i) => i.title)).toEqual([
      "Контрольная 1",
      "Эссе",
      "Контрольная 2",
      "Экзамен",
    ]);
    expect(res.body.items[0]).toEqual({
      id: fx.microQuiz1,
      title: "Контрольная 1",
      type: "test",
      dueAt: "2026-10-13T10:00:00+03:00",
      score: 2,
      max: 10,
      weight: 0.15,
      gradedAt: "2026-10-15T18:00:00+03:00",
    });
    expect(res.body.items[3]).toEqual({
      id: expect.any(String),
      title: "Экзамен",
      type: "exam",
      dueAt: null,
      score: null,
      max: 100,
      weight: 0.5,
      gradedAt: null,
    });
    // SPEC §6.4 п.3: история изменений — прозрачность, показываем кто и когда.
    expect(res.body.history).toEqual([
      {
        itemId: fx.microQuiz1,
        oldScore: null,
        newScore: 1,
        changedAt: "2026-10-14T17:00:00+03:00",
        changedBy: "Кравцова И. О.",
      },
      {
        itemId: fx.microQuiz1,
        oldScore: 1,
        newScore: 2,
        changedAt: "2026-10-15T18:00:00+03:00",
        changedBy: "Кравцова И. О.",
      },
    ]);
    // DS-03: для «удовл.» нужно 43,5 из 50 доступных — достижимо; на 4 и 5 уже нет.
    expect(res.body.needed).toEqual([
      { target: 3, needed: 43.5, achievable: true },
      { target: 4, needed: 58.5, achievable: false },
      { target: 5, needed: 73.5, achievable: false },
    ]);
  });

  it("Максим не видит дисциплину Ани → 404 NOT_FOUND", async () => {
    const res = await apiAs("maxim").get(`/api/me/grades/${fx.courses.micro}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND" } });
    expect(res.text).not.toContain("Кравцова");
  });

  it("Аня не видит дисциплину Максима → тот же 404", async () => {
    const res = await apiAs("anna").get(`/api/me/grades/${fx.courses.media}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND" } });
  });

  it("несуществующий и некорректный courseId → тот же 404", async () => {
    for (const id of ["0b7f2c1e-4d6a-4c8e-9f3b-2a1d5e6f7a8b", "not-a-uuid", "1"]) {
      const res = await apiAs("anna").get(`/api/me/grades/${id}`);
      expect(res.status, id).toBe(404);
      expect(res.body).toEqual({ error: { code: "NOT_FOUND" } });
    }
  });

  it("гость → 401, сотрудник → 403", async () => {
    expect((await apiAs("guest").get(`/api/me/grades/${fx.courses.micro}`)).status).toBe(401);
    expect((await apiAs("elena").get(`/api/me/grades/${fx.courses.micro}`)).status).toBe(403);
  });

  it("без N+1: карточка — фиксированное число запросов", async () => {
    const { count } = await countQueries(() =>
      apiAs("anna").get(`/api/me/grades/${fx.courses.micro}`),
    );
    // сессия + профиль (guard) + set_config + SET ROLE + курс + оценки + история + итоги
    expect(count).toBeLessThanOrEqual(12);
  });
});
