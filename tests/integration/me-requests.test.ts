import { beforeAll, describe, expect, it } from "vitest";
import type { ApiErrorBody, Paged, RequestDetailDTO, RequestDTO } from "@/contracts/api";
import { apiAs, countQueries, freezeTime, resetDb } from "../helpers/api";
import type { Fixtures } from "../helpers/fixtures";

// Эталонные тесты эндпоинта студента (DEEPSEEK-TASKS §4, блок 2): успешный ответ, валидация,
// и обязательно «Максим не видит данные Ани». Время заморожено до сида — даты детерминированы.

const NOW = "2026-11-12T12:00:00+03:00"; // четверг

let fx: Fixtures;
beforeAll(async () => {
  freezeTime(NOW);
  fx = await resetDb();
});

type Page = Paged<RequestDTO>;

describe("GET /api/me/requests", () => {
  it("возвращает заявки студента, новые первыми, в формате контракта", async () => {
    const res = await apiAs("anna").get<Page>("/api/me/requests");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.body.nextCursor).toBeNull();
    expect(res.body.items.map((r) => r.type.code)).toEqual(["study_cert", "scholarship_cert"]);
    expect(res.body.items[0]).toEqual({
      id: fx.requests.anna[0],
      number: expect.stringMatching(/^СП-2611-\d{4}$/),
      type: { code: "study_cert", title: "Справка об обучении" },
      status: "in_progress",
      delivery: "electronic",
      copies: 1,
      createdAt: "2026-11-11T10:15:00+03:00",
      dueAt: "2026-11-13T18:00:00+03:00",
      updatedAt: "2026-11-11T11:40:00+03:00",
      overdue: false,
      unseen: true,
      resubmittedFrom: null,
    });
  });

  it("вкладки active и archive фильтруют по статусу", async () => {
    const active = await apiAs("anna").get<Page>("/api/me/requests?tab=active");
    expect(active.body.items).toHaveLength(2);
    const archive = await apiAs("anna").get<Page>("/api/me/requests?tab=archive");
    expect(archive.body.items).toEqual([]);
  });

  it("курсорная пагинация проходит все страницы без повторов", async () => {
    const first = await apiAs("anna").get<Page>("/api/me/requests?limit=1");
    expect(first.body.items.map((r) => r.id)).toEqual([fx.requests.anna[0]]);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await apiAs("anna").get<Page>(
      `/api/me/requests?limit=1&cursor=${first.body.nextCursor}`,
    );
    expect(second.body.items.map((r) => r.id)).toEqual([fx.requests.anna[1]]);
    expect(second.body.nextCursor).toBeNull();
  });

  it("невалидные параметры → 422 VALIDATION с путём поля", async () => {
    const res = await apiAs("anna").get<ApiErrorBody>("/api/me/requests?limit=100&tab=deleted");
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION");
    const paths = (res.body.error.details as { issues: Array<{ path: string }> }).issues.map(
      (i) => i.path,
    );
    expect(paths.sort()).toEqual(["limit", "tab"]);

    const dashes = Buffer.from(`2026-11-01T00:00:00.000Z|${"-".repeat(36)}`).toString("base64url");
    for (const bad of ["garbage", dashes]) {
      const cursor = await apiAs("anna").get<ApiErrorBody>(`/api/me/requests?cursor=${bad}`);
      expect(cursor.status, bad).toBe(422);
    }
  });

  it("Максим не видит заявки Ани, даже если подставить её studentId", async () => {
    const res = await apiAs("maxim").get<Page>(`/api/me/requests?studentId=${fx.users.anna}`);
    expect(res.status).toBe(200);
    expect(res.body.items.map((r) => r.id)).toEqual(fx.requests.maxim);
  });

  it("гость → 401, сотрудник → 403", async () => {
    expect((await apiAs("guest").get("/api/me/requests")).status).toBe(401);
    expect((await apiAs("elena").get("/api/me/requests")).status).toBe(403);
  });

  it("без N+1: число запросов не зависит от размера страницы", async () => {
    const small = await countQueries(() => apiAs("anna").get("/api/me/requests?limit=1"));
    const large = await countQueries(() => apiAs("anna").get("/api/me/requests?limit=50"));
    expect(large.count).toBe(small.count);
  });

  it("overdue: срок прошёл, а заявка не готова", async () => {
    const restore = freezeTime("2026-11-15T12:00:00+03:00");
    try {
      const res = await apiAs("anna").get<Page>("/api/me/requests");
      const byCode = Object.fromEntries(res.body.items.map((r) => [r.type.code, r.overdue]));
      expect(byCode).toEqual({ study_cert: true, scholarship_cert: false }); // готовая не «просрочена»
    } finally {
      restore();
      freezeTime(NOW);
    }
  });
});

describe("GET /api/me/requests/:id", () => {
  it("карточка: трекер событий, ответственный, документ и место выдачи", async () => {
    const res = await apiAs("anna").get<RequestDetailDTO>(
      `/api/me/requests/${fx.requests.anna[0]}`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: fx.requests.anna[0],
      status: "in_progress",
      fields: { destination: "По месту требования" },
      assignee: { name: "Елена М.", unit: "Студенческий офис" },
      rejection: null,
      messages: [],
      document: null,
      pickup: null,
    });
    expect(res.body.events).toEqual([
      expect.objectContaining({
        fromStatus: null,
        toStatus: "submitted",
        actor: "student",
        actorName: null,
      }),
      expect.objectContaining({
        fromStatus: "submitted",
        toStatus: "in_progress",
        actor: "staff",
        actorName: "Елена М.",
      }),
    ]);
  });

  it("готовый оригинал показывает, где забрать", async () => {
    const res = await apiAs("anna").get<RequestDetailDTO>(
      `/api/me/requests/${fx.requests.anna[1]}`,
    );
    expect(res.body.status).toBe("ready");
    expect(res.body.pickup).toEqual({ place: "Каб. 112, корпус А", hours: "Пн–пт 10:00–17:00" });
  });

  it("переписка и уточнение сотрудника видны владельцу", async () => {
    const res = await apiAs("maxim").get<RequestDetailDTO>(
      `/api/me/requests/${fx.requests.maxim[0]}`,
    );
    expect(res.body.status).toBe("needs_info");
    expect(res.body.messages).toEqual([
      expect.objectContaining({
        author: "staff",
        authorName: "Елена М.",
        createdAt: "2026-11-11T14:20:00+03:00",
      }),
    ]);
    expect(res.body.events.at(-1)).toMatchObject({
      toStatus: "needs_info",
      comment: "Уточните, за какие семестры нужна выписка",
    });
  });

  it("Максим не видит заявку Ани → 404 NOT_FOUND", async () => {
    const res = await apiAs("maxim").get(`/api/me/requests/${fx.requests.anna[0]}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND" } });
    expect(res.text).not.toContain("Справка");
  });

  it("несуществующий и некорректный id → тот же 404", async () => {
    for (const id of ["0b7f2c1e-4d6a-4c8e-9f3b-2a1d5e6f7a8b", "not-a-uuid", "1"]) {
      const res = await apiAs("anna").get(`/api/me/requests/${id}`);
      expect(res.status, id).toBe(404);
      expect(res.body).toEqual({ error: { code: "NOT_FOUND" } });
    }
  });

  it("без N+1: карточка — фиксированное число запросов", async () => {
    const { count } = await countQueries(() =>
      apiAs("anna").get(`/api/me/requests/${fx.requests.anna[0]}`),
    );
    // сессия + профиль (guard) + set_config + SET ROLE + заявка + события + сообщения + документ
    expect(count).toBeLessThanOrEqual(10);
  });
});
