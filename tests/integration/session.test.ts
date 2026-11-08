import { and, asc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { ApiErrorBody, SessionDTO, UUID } from "@/contracts/api";
import { toMsk, toMskDate } from "@/lib/time";
import * as s from "@db/schema";
import { getDb } from "@/server/db";
import { apiAs, countQueries, freezeTime, resetDb } from "../helpers/api";
import type { Fixtures } from "../helpers/fixtures";

// DS-14. GET /api/me/session — экзамены и зачёты группы студента: порядок, Москва,
// формат комнаты, допуск. Время заморожено до сида; ожидание строим из строк БД,
// поэтому тест не зависит от конкретных дат сида демо-аккаунтов.

const NOW = "2026-11-12T12:00:00+03:00";

let fx: Fixtures;
beforeAll(async () => {
  freezeTime(NOW);
  fx = await resetDb();
});

const db = () => getDb();

/** groupId студента из профиля. */
async function groupIdOf(userId: string): Promise<UUID> {
  const [p] = await db()
    .select({ id: s.studentProfiles.groupId })
    .from(s.studentProfiles)
    .where(eq(s.studentProfiles.userId, userId));
  return p!.id;
}

/** Как должен выглядеть SessionDTO.items студента — собираем из БД так же, как репозиторий. */
async function expectedItems(studentId: string, groupId: string) {
  const exams = await db()
    .select({
      exam: s.exams,
      courseTitle: s.courses.title,
      room: { building: s.rooms.building, number: s.rooms.number },
    })
    .from(s.exams)
    .innerJoin(s.courses, eq(s.courses.id, s.exams.courseId))
    .innerJoin(s.rooms, eq(s.rooms.id, s.exams.roomId))
    .where(eq(s.exams.groupId, groupId))
    .orderBy(asc(s.exams.startsAt), asc(s.exams.id));
  const admissions = await db()
    .select()
    .from(s.admissions)
    .where(eq(s.admissions.studentId, studentId));
  const byExam = new Map(admissions.map((a) => [a.examId, a]));
  return exams.map(({ exam, courseTitle, room }) => {
    const admission = byExam.get(exam.id);
    return {
      id: exam.id as UUID,
      courseTitle,
      type: exam.type,
      startsAt: toMsk(exam.startsAt),
      room: `${room.building}-${room.number}`,
      consultationAt: exam.consultationAt ? toMsk(exam.consultationAt) : null,
      admitted: admission ? admission.admitted : null,
      admissionReason: admission ? admission.reason : null,
    };
  });
}

describe("GET /api/me/session", () => {
  it("возвращает SessionDTO в формате контракта: данные совпадают с БД", async () => {
    const res = await apiAs("anna").get<SessionDTO>("/api/me/session");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const expected = await expectedItems(fx.users.anna, await groupIdOf(fx.users.anna));
    expect(expected.length).toBeGreaterThanOrEqual(1);
    expect(res.body.items).toEqual(expected);
    expect(res.body.startsOn).toBe(toMskDate(expected[0]!.startsAt));
    expect(res.body.endsOn).toBe(toMskDate(expected[expected.length - 1]!.startsAt));
  });

  it("экзамены по возрастанию startsAt, время в московском поясе", async () => {
    const res = await apiAs("anna").get<SessionDTO>("/api/me/session");
    const starts = res.body.items.map((i) => i.startsAt);
    expect([...starts].sort()).toEqual(starts);
    for (const startsAt of starts) expect(startsAt.endsWith("+03:00")).toBe(true);
    for (const item of res.body.items) {
      if (item.consultationAt) {
        expect(item.consultationAt.endsWith("+03:00")).toBe(true);
        expect(item.consultationAt < item.startsAt).toBe(true); // консультация раньше экзамена
      }
      expect(item.room).toMatch(/^[АБВГ]-\d+$/);
      expect(Object.keys(item).sort()).toEqual(
        [
          "admitted",
          "admissionReason",
          "consultationAt",
          "courseTitle",
          "id",
          "room",
          "startsAt",
          "type",
        ].sort(),
      );
    }
  });

  it("допуск с причиной попадает в ответ", async () => {
    const [admission] = await db()
      .select()
      .from(s.admissions)
      .where(eq(s.admissions.studentId, fx.users.anna))
      .limit(1);
    expect(admission).toBeDefined();
    const { examId } = admission!;
    await db()
      .update(s.admissions)
      .set({ admitted: false, reason: "Не допущен: недобор по контрольным точкам" })
      .where(and(eq(s.admissions.examId, examId), eq(s.admissions.studentId, fx.users.anna)));
    try {
      const res = await apiAs("anna").get<SessionDTO>("/api/me/session");
      const item = res.body.items.find((i) => i.id === examId);
      expect(item?.admitted).toBe(false);
      expect(item?.admissionReason).toBe("Не допущен: недобор по контрольным точкам");
    } finally {
      // Чистим за собой: общая тестовая БД переиспользуется другими файлами в пределах прогона.
      await db()
        .update(s.admissions)
        .set({ admitted: null, reason: null })
        .where(and(eq(s.admissions.examId, examId), eq(s.admissions.studentId, fx.users.anna)));
    }
  });

  it("Максим не видит экзамены Ани и наоборот, даже с подставленным studentId", async () => {
    const annaIds = (await expectedItems(fx.users.anna, await groupIdOf(fx.users.anna))).map(
      (i) => i.id,
    );
    const maximIds = (await expectedItems(fx.users.maxim, await groupIdOf(fx.users.maxim))).map(
      (i) => i.id,
    );

    for (const [actor, expected, foreignIds] of [
      ["anna", expectedItems(fx.users.anna, await groupIdOf(fx.users.anna)), maximIds],
      ["maxim", expectedItems(fx.users.maxim, await groupIdOf(fx.users.maxim)), annaIds],
    ] as const) {
      const res = await apiAs(actor).get<SessionDTO>("/api/me/session");
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual(await expected);
      const returned = res.body.items.map((i) => i.id);
      for (const foreignId of foreignIds) expect(returned).not.toContain(foreignId);
    }

    // Подставленный studentId из query игнорируется — данные всё равно свои.
    const injected = await apiAs("maxim").get<SessionDTO>(
      `/api/me/session?studentId=${fx.users.anna}`,
    );
    expect(injected.status).toBe(200);
    expect(injected.body.items).toEqual(
      await expectedItems(fx.users.maxim, await groupIdOf(fx.users.maxim)),
    );
  });

  it("без записи о допуске: admitted = null (leftJoin)", async () => {
    const maximGroupId = await groupIdOf(fx.users.maxim);
    const [exam] = await db()
      .select({ id: s.exams.id })
      .from(s.exams)
      .where(eq(s.exams.groupId, maximGroupId))
      .limit(1);
    await db()
      .delete(s.admissions)
      .where(and(eq(s.admissions.examId, exam!.id), eq(s.admissions.studentId, fx.users.maxim)));
    const res = await apiAs("maxim").get<SessionDTO>("/api/me/session");
    const item = res.body.items.find((i) => i.id === exam!.id);
    expect(item).toMatchObject({ admitted: null, admissionReason: null });
  });

  it("гость → 401, сотрудник → 403", async () => {
    const guest = await apiAs("guest").get<ApiErrorBody>("/api/me/session");
    expect(guest.status).toBe(401);
    expect(guest.body).toEqual({ error: { code: "UNAUTHORIZED" } });
    const staff = await apiAs("elena").get<ApiErrorBody>("/api/me/session");
    expect(staff.status).toBe(403);
    expect(staff.body).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  it("без N+1: фиксированное число запросов выборки сессии", async () => {
    const { count } = await countQueries(() => apiAs("anna").get("/api/me/session"));
    expect(count).toBeLessThanOrEqual(10);
  });
});
