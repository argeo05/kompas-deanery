import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type {
  ApiErrorBody,
  MessageDTO,
  TicketDTO,
  TicketDetailDTO,
  TicketsDTO,
} from "@/contracts/api";
import { getDb } from "@/server/db";
import { classes, enrollments, studentProfiles, ticketMessages, tickets } from "@db/schema";
import { apiAs, countQueries, freezeTime, resetDb } from "../helpers/api";
import type { Fixtures } from "../helpers/fixtures";

// Тесты обращений в деканат — сторона студента (DS-21, SPEC §6.8.1): успех, валидация,
// ссылки на свои объекты, сортировка списка и обязательно «Максим не видит обращения Ани».
// Ответы сотрудников (DS-33) симулируются прямой вставкой, как в factories.ts.

const NOW = "2026-11-12T12:00:00+03:00"; // четверг

let fx: Fixtures;
let annaTicket: string;
let annaCourseIds: string[];
let maximCourseIds: string[];
let annaClassId: string;
let maximClassId: string;

const idem = () => ({ "idempotency-key": `ds21-${randomUUID()}` });
const at = (iso: string) => new Date(iso);

beforeAll(async () => {
  freezeTime(NOW);
  fx = await resetDb();
  const db = getDb();

  // Обращение Ани из фикстуры (аналог f.annaTicket в tests/security/factories.ts).
  const createdAt = at(NOW);
  const [row] = await db
    .insert(tickets)
    .values({
      studentId: fx.users.anna,
      topic: "requests",
      status: "open",
      createdAt,
      lastMessageAt: createdAt,
    })
    .returning({ id: tickets.id });
  annaTicket = row.id;
  await db
    .insert(ticketMessages)
    .values({ ticketId: annaTicket, authorId: fx.users.anna, body: "Фикстура", createdAt });

  // Записи на дисциплины и пары групп — для ссылок kind = course / class (свой объект).
  annaCourseIds = (
    await db
      .select({ courseId: enrollments.courseId })
      .from(enrollments)
      .where(eq(enrollments.studentId, fx.users.anna))
  ).map((r) => r.courseId);
  maximCourseIds = (
    await db
      .select({ courseId: enrollments.courseId })
      .from(enrollments)
      .where(eq(enrollments.studentId, fx.users.maxim))
  ).map((r) => r.courseId);
  expect(annaCourseIds.length).toBeGreaterThan(0);
  expect(maximCourseIds.length).toBeGreaterThan(0);

  const groupClassOf = async (studentId: string) => {
    const [profile] = await db
      .select({ groupId: studentProfiles.groupId })
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, studentId));
    if (!profile) throw new Error("нет профиля студента в сиде");
    const [cls] = await db
      .select({ id: classes.id })
      .from(classes)
      .where(eq(classes.groupId, profile.groupId))
      .limit(1);
    return cls?.id;
  };
  annaClassId = await groupClassOf(fx.users.anna);
  maximClassId = await groupClassOf(fx.users.maxim);
  // Группы разные: пара группы Ани не принадлежит расписанию Максима.
  expect(annaClassId).toBeDefined();
  expect(maximClassId).toBeDefined();
  expect(annaClassId).not.toBe(maximClassId);
});

describe("GET /api/me/tickets", () => {
  it("гость → 401, сотрудник → 403", async () => {
    expect((await apiAs("guest").get("/api/me/tickets")).status).toBe(401);
    expect((await apiAs("elena").get("/api/me/tickets")).status).toBe(403);
  });

  it("список пуст, пока обращений нет; формат no-store", async () => {
    const res = await apiAs("maxim").get<TicketsDTO>("/api/me/tickets");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.body.items).toEqual([]);
  });
});

describe("POST /api/me/tickets", () => {
  it("создание: без Idempotency-Key → 422, с ключом → 201 TicketDTO", async () => {
    const noKey = await apiAs("anna").post("/api/me/tickets", { topic: "dorm", body: "Вопрос" });
    expect(noKey.status).toBe(422);
    expect(noKey.body).toMatchObject({
      error: { code: "VALIDATION", details: { reason: "IDEMPOTENCY_KEY_REQUIRED" } },
    });

    // studentId из тела игнорируется (ids только из сессии).
    const created = await apiAs("anna").post<TicketDTO>(
      "/api/me/tickets",
      { topic: "dorm", body: "Когда заселяют в общежитие?", studentId: "substituted-not-used" },
      { headers: idem() },
    );
    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      id: expect.any(String),
      topic: "dorm",
      status: "open",
      createdAt: "2026-11-12T12:00:00+03:00",
      lastMessageAt: "2026-11-12T12:00:00+03:00",
      unread: false,
    });
  });

  it("невалидные тема и текст → 422 VALIDATION", async () => {
    for (const body of [
      { topic: "weather", body: "Вопрос" },
      { topic: "grades", body: "" },
      { topic: "grades", body: "   " },
      { topic: "grades", body: "б".repeat(2001) },
      { topic: "grades" },
    ]) {
      const res = await apiAs("anna").post<ApiErrorBody>("/api/me/tickets", body, {
        headers: idem(),
      });
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION");
      expect(res.body.error.details).toHaveProperty("issues");
    }
  });

  it("граничная длина: 2000 символов принимается", async () => {
    const res = await apiAs("anna").post(
      "/api/me/tickets",
      { topic: "other", body: "ч".repeat(2000) },
      { headers: idem() },
    );
    expect(res.status).toBe(201);
  });

  it("повтор с тем же ключом → тот же ответ; ключ с другим телом → 422", async () => {
    const key = { "idempotency-key": "ds21-repeat-test-key" };
    const body = { topic: "other", body: "Идемпотентность работает" };
    const first = await apiAs("anna").post<TicketDTO>("/api/me/tickets", body, { headers: key });
    expect(first.status).toBe(201);
    const replay = await apiAs("anna").post<TicketDTO>("/api/me/tickets", body, { headers: key });
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(first.body.id);
    expect(replay.headers.get("Idempotent-Replayed")).toBe("true");
    const reused = await apiAs("anna").post<ApiErrorBody>(
      "/api/me/tickets",
      { ...body, topic: "grades" },
      { headers: key },
    );
    expect(reused.status).toBe(422);
    expect(reused.body).toMatchObject({
      error: { code: "VALIDATION", details: { reason: "IDEMPOTENCY_KEY_REUSED" } },
    });
  });

  it("гость → 401, сотрудник → 403", async () => {
    const guest = await apiAs("guest").post(
      "/api/me/tickets",
      { topic: "other", body: "..." },
      { headers: idem() },
    );
    expect(guest.status).toBe(401);
    const staff = await apiAs("elena").post(
      "/api/me/tickets",
      { topic: "other", body: "..." },
      { headers: idem() },
    );
    expect(staff.status).toBe(403);
  });
});

describe("ссылки на объекты (link)", () => {
  it("ссылка на свою заявку → 201; на чужую и несуществующую → 404", async () => {
    const own = await apiAs("anna").post(
      "/api/me/tickets",
      {
        topic: "requests",
        body: "Когда будет готова моя справка?",
        link: { kind: "request", id: fx.requests.anna[0] },
      },
      { headers: idem() },
    );
    expect(own.status).toBe(201);

    for (const link of [fx.requests.anna[0], randomUUID()]) {
      const res = await apiAs("maxim").post<ApiErrorBody>(
        "/api/me/tickets",
        { topic: "requests", body: "Пробую чужое", link: { kind: "request", id: link } },
        { headers: idem() },
      );
      expect(res.status, link).toBe(404);
      expect(res.body).toEqual({ error: { code: "NOT_FOUND" } });
    }
  });

  it("ссылка на дисциплину: своя запись → 201, чужая → 404", async () => {
    const own = await apiAs("anna").post(
      "/api/me/tickets",
      {
        topic: "grades",
        body: "Про мою оценку",
        link: { kind: "course", id: annaCourseIds[0] },
      },
      { headers: idem() },
    );
    expect(own.status).toBe(201);

    const foreign = await apiAs("maxim").post<ApiErrorBody>(
      "/api/me/tickets",
      {
        topic: "grades",
        body: "Чужая дисциплина",
        link: { kind: "course", id: annaCourseIds[0] },
      },
      { headers: idem() },
    );
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual({ error: { code: "NOT_FOUND" } });
  });

  it("ссылка на пару: своя пара → 201, пара другой группы → 404", async () => {
    const own = await apiAs("maxim").post(
      "/api/me/tickets",
      { topic: "schedule", body: "Про мою пару", link: { kind: "class", id: maximClassId } },
      { headers: idem() },
    );
    expect(own.status).toBe(201);

    const foreign = await apiAs("maxim").post<ApiErrorBody>(
      "/api/me/tickets",
      { topic: "schedule", body: "Чужая пара", link: { kind: "class", id: annaClassId } },
      { headers: idem() },
    );
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual({ error: { code: "NOT_FOUND" } });
  });

  it("невалидная ссылка (kind вне списка, кривой id) → 422", async () => {
    for (const link of [
      { kind: "deadline", id: randomUUID() },
      { kind: "request", id: "not-a-uuid" },
    ]) {
      const res = await apiAs("anna").post<ApiErrorBody>(
        "/api/me/tickets",
        { topic: "other", body: "Ссылка", link },
        { headers: idem() },
      );
      expect(res.status, JSON.stringify(link)).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION");
    }
  });
});

describe("сортировка списка", () => {
  it("свежие обращения первыми (по lastMessageAt)", async () => {
    freezeTime("2026-11-12T12:05:00+03:00");
    const t1 = await apiAs("maxim").post<TicketDTO>(
      "/api/me/tickets",
      { topic: "other", body: "Первый" },
      { headers: idem() },
    );
    freezeTime("2026-11-12T12:07:00+03:00");
    const t2 = await apiAs("maxim").post<TicketDTO>(
      "/api/me/tickets",
      { topic: "dorm", body: "Второй" },
      { headers: idem() },
    );
    freezeTime("2026-11-12T12:09:00+03:00");
    const t3 = await apiAs("maxim").post<TicketDTO>(
      "/api/me/tickets",
      { topic: "scholarship", body: "Третий" },
      { headers: idem() },
    );
    freezeTime(NOW);
    expect([t1.status, t2.status, t3.status]).toEqual([201, 201, 201]);

    const res = await apiAs("maxim").get<TicketsDTO>("/api/me/tickets");
    expect(res.status).toBe(200);
    expect(res.body.items.slice(0, 3).map((t) => t.id)).toEqual([
      t3.body.id,
      t2.body.id,
      t1.body.id,
    ]);
  });

  it("сообщение студента обновляет lastMessageAt и поднимает обращение в списке", async () => {
    const list = await apiAs("maxim").get<TicketsDTO>("/api/me/tickets");
    const oldest = list.body.items.at(-1);
    if (!oldest) throw new Error("нет обращений у Максима");
    expect(oldest.lastMessageAt).toBe("2026-11-12T12:00:00+03:00");

    freezeTime("2026-11-12T12:11:00+03:00");
    const posted = await apiAs("maxim").post<MessageDTO>(`/api/me/tickets/${oldest.id}/messages`, {
      body: "Обновляю своё обращение",
    });
    expect(posted.status).toBe(201);
    expect(posted.body).toMatchObject({ author: "student", authorName: "Максим" });
    freezeTime(NOW);

    const refreshed = await apiAs("maxim").get<TicketsDTO>("/api/me/tickets");
    expect(refreshed.body.items[0]?.id).toBe(oldest.id);
    expect(refreshed.body.items[0]?.lastMessageAt).toBe("2026-11-12T12:11:00+03:00");
    expect(refreshed.body.items[0]?.unread).toBe(false);
  });
});

describe("GET /api/me/tickets/:id", () => {
  it("карточка с перепиской по времени, автор — displayName студента", async () => {
    freezeTime("2026-11-12T12:20:00+03:00");
    const created = await apiAs("anna").post<TicketDTO>(
      "/api/me/tickets",
      { topic: "requests", body: "Первый вопрос" },
      { headers: idem() },
    );
    freezeTime("2026-11-12T12:30:00+03:00");
    const m1 = await apiAs("anna").post<MessageDTO>(`/api/me/tickets/${created.body.id}/messages`, {
      body: "Уточнение",
    });
    freezeTime(NOW);
    expect(created.status).toBe(201);
    expect(m1.status).toBe(201);

    const res = await apiAs("anna").get<TicketDetailDTO>(`/api/me/tickets/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.messages.map((m) => [m.author, m.authorName, m.createdAt])).toEqual([
      ["student", "Аня", "2026-11-12T12:20:00+03:00"],
      ["student", "Аня", "2026-11-12T12:30:00+03:00"],
    ]);
    expect(res.body.lastMessageAt).toBe("2026-11-12T12:30:00+03:00");
  });

  it("Максим не видит обращение Ани → 404 NOT_FOUND", async () => {
    const res = await apiAs("maxim").get<ApiErrorBody>(`/api/me/tickets/${annaTicket}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND" } });
    expect(res.text).not.toContain("Фикстура");
  });

  it("несуществующий и некорректный id → тот же 404", async () => {
    for (const id of [randomUUID(), "not-a-uuid", "1"]) {
      const res = await apiAs("anna").get<ApiErrorBody>(`/api/me/tickets/${id}`);
      expect(res.status, id).toBe(404);
      expect(res.body).toEqual({ error: { code: "NOT_FOUND" } });
    }
  });

  it("гость → 401, сотрудник → 403", async () => {
    expect((await apiAs("guest").get(`/api/me/tickets/${annaTicket}`)).status).toBe(401);
    expect((await apiAs("elena").get(`/api/me/tickets/${annaTicket}`)).status).toBe(403);
  });
});

describe("POST /api/me/tickets/:id/messages", () => {
  it("невалидный id → 404, чужой → 404, гость → 401, сотрудник → 403", async () => {
    for (const id of [randomUUID(), "not-a-uuid"]) {
      const res = await apiAs("anna").post<ApiErrorBody>(`/api/me/tickets/${id}/messages`, {
        body: "Сообщ.",
      });
      expect(res.status, id).toBe(404);
      expect(res.body).toEqual({ error: { code: "NOT_FOUND" } });
    }
    const foreign = await apiAs("maxim").post<ApiErrorBody>(
      `/api/me/tickets/${annaTicket}/messages`,
      { body: "Чужому" },
    );
    expect(foreign.status).toBe(404);
    expect(
      (await apiAs("guest").post(`/api/me/tickets/${annaTicket}/messages`, { body: "Тест" }))
        .status,
    ).toBe(401);
    expect(
      (await apiAs("elena").post(`/api/me/tickets/${annaTicket}/messages`, { body: "Тест" }))
        .status,
    ).toBe(403);
  });

  it("невалидный текст → 422", async () => {
    freezeTime("2026-11-12T12:20:00+03:00");
    const created = await apiAs("anna").post<TicketDTO>(
      "/api/me/tickets",
      { topic: "other", body: "Для сообщений" },
      { headers: idem() },
    );
    freezeTime(NOW);
    for (const body of [{ body: "" }, { body: "   " }, { body: ".".repeat(2001) }]) {
      const res = await apiAs("anna").post<ApiErrorBody>(
        `/api/me/tickets/${created.body.id}/messages`,
        body,
      );
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION");
    }
  });

  it("в закрытое обращение сообщение не пишется → 409 CONFLICT", async () => {
    freezeTime("2026-11-12T12:20:00+03:00");
    const created = await apiAs("anna").post<TicketDTO>(
      "/api/me/tickets",
      { topic: "dorm", body: "Для закрытия" },
      { headers: idem() },
    );
    freezeTime(NOW);
    expect(created.status).toBe(201);
    await getDb().update(tickets).set({ status: "closed" }).where(eq(tickets.id, created.body.id));

    const res = await apiAs("anna").post<ApiErrorBody>(
      `/api/me/tickets/${created.body.id}/messages`,
      { body: "А если так?" },
    );
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: "CONFLICT" } });
    const detail = await apiAs("anna").get<TicketDetailDTO>(`/api/me/tickets/${created.body.id}`);
    expect(detail.body.messages.map((m) => m.body)).toEqual(["Для закрытия"]);
  });
});

describe("непрочитанное", () => {
  it("ответ сотрудника ставит unread=true, открытие карточки гасит", async () => {
    // Сторону сотрудника (DS-33) симулируем прямой вставкой по образцу factories.ts.
    const db = getDb();
    freezeTime("2026-11-12T12:40:00+03:00");
    await db.insert(ticketMessages).values({
      ticketId: annaTicket,
      authorId: fx.users.elena,
      body: "Ответ деканата",
      createdAt: at("2026-11-12T12:40:00+03:00"),
    });
    await db
      .update(tickets)
      .set({ lastMessageAt: at("2026-11-12T12:40:00+03:00") })
      .where(eq(tickets.id, annaTicket));

    const list = await apiAs("anna").get<TicketsDTO>("/api/me/tickets");
    expect(list.body.items.find((t) => t.id === annaTicket)).toMatchObject({ unread: true });

    // Открыли карточку позже ответа — прочитали, unread гаснет.
    freezeTime("2026-11-12T12:45:00+03:00");
    const detail = await apiAs("anna").get<TicketDetailDTO>(`/api/me/tickets/${annaTicket}`);
    expect(detail.status).toBe(200);
    expect(detail.body.messages.at(-1)).toMatchObject({ author: "staff", authorName: "Елена М." });

    const after = await apiAs("anna").get<TicketsDTO>("/api/me/tickets");
    expect(after.body.items.find((t) => t.id === annaTicket)).toMatchObject({ unread: false });
    freezeTime(NOW);

    // Ещё один ответ сотрудника — снова unread.
    await db.insert(ticketMessages).values({
      ticketId: annaTicket,
      authorId: fx.users.elena,
      body: "Приложите документ",
      createdAt: at("2026-11-12T12:50:00+03:00"),
    });
    await db
      .update(tickets)
      .set({ lastMessageAt: at("2026-11-12T12:50:00+03:00") })
      .where(eq(tickets.id, annaTicket));
    const again = await apiAs("anna").get<TicketsDTO>("/api/me/tickets");
    expect(again.body.items.find((t) => t.id === annaTicket)).toMatchObject({ unread: true });
    freezeTime(NOW);
  });
});

describe("без N+1", () => {
  it("карточка — фиксированное число запросов", async () => {
    freezeTime("2026-11-12T13:00:00+03:00");
    const created = await apiAs("anna").post<TicketDTO>(
      "/api/me/tickets",
      { topic: "other", body: "Для профилирования" },
      { headers: idem() },
    );
    freezeTime(NOW);
    const { count } = await countQueries(() =>
      apiAs("anna").get(`/api/me/tickets/${created.body.id}`),
    );
    // Сессия + профиль + set_config + SET ROLE + обращение + переписка + отметка прочтения.
    expect(count).toBeLessThanOrEqual(10);
  });
});
