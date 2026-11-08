import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type {
  ApiErrorBody,
  MessageDTO,
  StaffTicketDetailDTO,
  StaffTicketRowDTO,
  TicketDetailDTO,
  TicketsDTO,
} from "@/contracts/api";
import { getDb } from "@/server/db";
import { notifications, ticketMessages, tickets } from "@db/schema";
import { apiAs, freezeTime, resetDb } from "../helpers/api";
import type { Fixtures } from "../helpers/fixtures";

// Тесты обращений — сторона сотрудника (DS-33, SPEC §6.8.2): список в области видимости,
// карточка, ответ (статус answered + уведомление), закрытие и обязательно изоляция:
// Аня (студент) → 403, Олег (деканат другого факультета) → 404 / нет в списке, гость → 401.

const NOW = "2026-11-12T12:00:00+03:00"; // четверг

let fx: Fixtures;
let annaTicket: string;

const at = (iso: string) => new Date(iso);
type StudentTicketDTO = TicketsDTO["items"][number];

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
    .values({ ticketId: annaTicket, authorId: fx.users.anna, body: "Вопрос от Ани", createdAt });
});

describe("GET /api/staff/tickets", () => {
  it("сотрудник видит обращение Ани с ФИО и группой; гость → 401, Аня → 403", async () => {
    const guest = await apiAs("guest").get("/api/staff/tickets");
    expect(guest.status).toBe(401);
    const forbidden = await apiAs("anna").get<ApiErrorBody>("/api/staff/tickets");
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({ error: { code: "FORBIDDEN" } });

    const res = await apiAs("elena").get<{ items: StaffTicketRowDTO[] }>("/api/staff/tickets");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const row = res.body.items.find((t) => t.id === annaTicket);
    expect(row).toMatchObject({
      id: annaTicket,
      topic: "requests",
      status: "open",
      student: { fullName: "Соколова Анна Дмитриевна", group: "Б-ЭК-101" },
    });
  });

  it("Олег — деканат другого факультета: обращения Ани нет в списке", async () => {
    const res = await apiAs("oleg").get<{ items: StaffTicketRowDTO[] }>("/api/staff/tickets");
    expect(res.status).toBe(200);
    expect(res.body.items.find((t) => t.id === annaTicket)).toBeUndefined();
  });

  it("фильтр status=open|answered|closed; неизвестный статус → 422", async () => {
    freezeTime("2026-11-12T12:05:00+03:00");
    const created = await apiAs("anna").post<StudentTicketDTO>("/api/me/tickets", {
      topic: "dorm",
      body: "Для фильтра",
    }, { headers: { "idempotency-key": randomUUID() } });
    expect(created.status).toBe(201);
    freezeTime(NOW);

    const open = await apiAs("elena").get<{ items: StaffTicketRowDTO[] }>(
      "/api/staff/tickets?status=open",
    );
    expect(open.body.items.some((t) => t.id === created.body.id)).toBe(true);

    const answered = await apiAs("elena").get<{ items: StaffTicketRowDTO[] }>(
      "/api/staff/tickets?status=answered",
    );
    expect(answered.body.items.some((t) => t.id === created.body.id)).toBe(false);

    const unknown = await apiAs("elena").get("/api/staff/tickets?status=settled");
    expect(unknown.status).toBe(422);
  });
});

describe("ответ сотрудника", () => {
  it("POST messages → 201 MessageDTO; статус answered у Ани; уведомление создано", async () => {
    freezeTime("2026-11-12T12:10:00+03:00");
    const reply = await apiAs("elena").post<MessageDTO>(
      `/api/staff/tickets/${annaTicket}/messages`,
      { body: "Ответ деканата: справка будет готова завтра" },
    );
    freezeTime(NOW);
    expect(reply.status).toBe(201);
    expect(reply.body).toMatchObject({
      id: expect.any(String),
      author: "staff",
      authorName: "Елена М.",
      body: "Ответ деканата: справка будет готова завтра",
      createdAt: "2026-11-12T12:10:00+03:00",
    });

    // Статус answered виден в студентском списке Ани; появилось непрочитанное (studentSeenAt
    // ответ сотрудника не трогает — гаснет ниже открытием карточки, DS-21).
    const list = await apiAs("anna").get<TicketsDTO>("/api/me/tickets");
    const row = list.body.items.find((t) => t.id === annaTicket);
    expect(row).toMatchObject({ status: "answered", unread: true });

    // Одно уведомление студенту (категория ticket, ссылка на обращение).
    const notes = await getDb()
      .select()
      .from(notifications)
      .where(and(eq(notifications.linkId, annaTicket), eq(notifications.category, "ticket")));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ userId: fx.users.anna, class: "personal" });
  });

  it("открытие карточки Аней гасит unread", async () => {
    freezeTime("2026-11-12T12:20:00+03:00");
    const detail = await apiAs("anna").get<StudentTicketDTO>(`/api/me/tickets/${annaTicket}`);
    expect(detail.status).toBe(200);
    const after = await apiAs("anna").get<TicketsDTO>("/api/me/tickets");
    expect(after.body.items.find((t) => t.id === annaTicket)).toMatchObject({ unread: false });
    freezeTime(NOW);
  });

  it("невалидный текст: пустой и 2002 символа → 422 VALIDATION; 2000 → 201", async () => {
    for (const body of [{ body: "" }, { body: " ".repeat(3) }, { body: "д".repeat(2002) }]) {
      const res = await apiAs("elena").post<ApiErrorBody>(
        `/api/staff/tickets/${annaTicket}/messages`,
        body,
      );
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION");
    }
    const border = await apiAs("elena").post(`/api/staff/tickets/${annaTicket}/messages`, {
      body: "о".repeat(2000),
    });
    expect(border.status).toBe(201);
  });

  it("гость → 401, студент → 403, чужой факультет и «кривой» id → 404", async () => {
    expect(
      (await apiAs("guest").post(`/api/staff/tickets/${annaTicket}/messages`, { body: "…" }))
        .status,
    ).toBe(401);
    expect(
      (await apiAs("anna").post(`/api/staff/tickets/${annaTicket}/messages`, { body: "…" })).status,
    ).toBe(403);

    const foreign = await apiAs("oleg").post<ApiErrorBody>(
      `/api/staff/tickets/${annaTicket}/messages`,
      { body: "Чужому студенту" },
    );
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual({ error: { code: "NOT_FOUND" } });

    for (const id of [randomUUID(), "not-a-uuid"]) {
      const res = await apiAs("elena").post<ApiErrorBody>(`/api/staff/tickets/${id}/messages`, {
        body: "Некуда",
      });
      expect(res.status, id).toBe(404);
      expect(res.body).toEqual({ error: { code: "NOT_FOUND" } });
    }
  });
});

describe("GET /api/staff/tickets/:id", () => {
  it("карточка с перепиской по времени (замороженные часы — порядок вставки)", async () => {
    const res = await apiAs("elena").get<StaffTicketDetailDTO>(`/api/staff/tickets/${annaTicket}`);
    expect(res.status).toBe(200);
    expect(res.body.messages.map((m) => [m.author, m.authorName])).toEqual([
      ["student", "Аня"],
      ["staff", "Елена М."], // сообщение-валидация из describe «ответ сотрудника»
      ["staff", "Елена М."],
    ]);
    expect(res.body.messages[2]?.body).toBe("Ответ деканата: справка будет готова завтра");
    expect(res.body.student).toEqual({ fullName: "Соколова Анна Дмитриевна", group: "Б-ЭК-101" });
  });

  it("чужой факультет (Олег), несуществующий и «кривой» id → 404 NOT_FOUND", async () => {
    const foreign = await apiAs("oleg").get<ApiErrorBody>(`/api/staff/tickets/${annaTicket}`);
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual({ error: { code: "NOT_FOUND" } });

    for (const id of [randomUUID(), "not-a-uuid", "1"]) {
      const res = await apiAs("elena").get<ApiErrorBody>(`/api/staff/tickets/${id}`);
      expect(res.status, id).toBe(404);
      expect(res.body).toEqual({ error: { code: "NOT_FOUND" } });
    }
  });

  it("гость → 401, студент → 403", async () => {
    expect((await apiAs("guest").get(`/api/staff/tickets/${annaTicket}`)).status).toBe(401);
    expect((await apiAs("anna").get(`/api/staff/tickets/${annaTicket}`)).status).toBe(403);
  });
});

describe("POST /api/staff/tickets/:id/close", () => {
  let closeable: string;

  beforeAll(async () => {
    freezeTime("2026-11-12T12:30:00+03:00");
    const created = await apiAs("anna").post<StudentTicketDTO>("/api/me/tickets", {
      topic: "scholarship",
      body: "Обращение для закрытия",
    }, { headers: { "idempotency-key": randomUUID() } });
    expect(created.status).toBe(201);
    closeable = created.body.id;
    freezeTime(NOW);
  });

  it("гость → 401, студент → 403, чужой факультет и «кривой» id → 404", async () => {
    expect((await apiAs("guest").post(`/api/staff/tickets/${closeable}/close`)).status).toBe(401);
    expect((await apiAs("anna").post(`/api/staff/tickets/${closeable}/close`)).status).toBe(403);

    const foreign = await apiAs("oleg").post<ApiErrorBody>(`/api/staff/tickets/${closeable}/close`);
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual({ error: { code: "NOT_FOUND" } });

    for (const id of [randomUUID(), "not-a-uuid"]) {
      const res = await apiAs("elena").post<ApiErrorBody>(`/api/staff/tickets/${id}/close`);
      expect(res.status, id).toBe(404);
    }
  });

  it("закрытие: статус closed в ответе и в списке сотрудника", async () => {
    freezeTime("2026-11-12T12:35:00+03:00");
    const res = await apiAs("elena").post<StaffTicketRowDTO>(
      `/api/staff/tickets/${closeable}/close`,
    );
    freezeTime(NOW);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: closeable,
      status: "closed",
      student: { fullName: "Соколова Анна Дмитриевна", group: "Б-ЭК-101" },
    });

    const closed = await apiAs("elena").get<{ items: StaffTicketRowDTO[] }>(
      "/api/staff/tickets?status=closed",
    );
    expect(closed.body.items.find((t) => t.id === closeable)).toMatchObject({ status: "closed" });

    const list = await apiAs("anna").get<TicketsDTO>("/api/me/tickets");
    expect(list.body.items.find((t) => t.id === closeable)).toMatchObject({ status: "closed" });
  });

  it("повторное закрытие → 409 CONFLICT", async () => {
    const res = await apiAs("elena").post<ApiErrorBody>(`/api/staff/tickets/${closeable}/close`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: "CONFLICT" } });
  });

  it("студентское сообщение в закрытое обращение → 409 (механика DS-21)", async () => {
    const res = await apiAs("anna").post<ApiErrorBody>(`/api/me/tickets/${closeable}/messages`, {
      body: "А если снова открыть вопрос?",
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: "CONFLICT" } });

    const detail = await apiAs("anna").get<TicketDetailDTO>(`/api/me/tickets/${closeable}`);
    expect(detail.status).toBe(200);
    expect(detail.body.messages.map((m) => m.body)).toEqual(["Обращение для закрытия"]);
  });

  it("ответ сотрудника в закрытое обращение → 409; закрытие не создаёт уведомлений (нет ключа)", async () => {
    freezeTime("2026-11-12T12:40:00+03:00");
    const staffReply = await apiAs("elena").post<ApiErrorBody>(
      `/api/staff/tickets/${closeable}/messages`,
      { body: "В закрытое не пишем" },
    );
    freezeTime(NOW);
    expect(staffReply.status).toBe(409);
    expect(staffReply.body).toEqual({ error: { code: "CONFLICT" } });

    // Ключа «обращение закрыто» в notify-templates нет — уведомление не создаётся.
    const notes = await getDb()
      .select()
      .from(notifications)
      .where(and(eq(notifications.linkId, closeable), eq(notifications.category, "ticket")));
    expect(notes).toHaveLength(0);
  });
});
