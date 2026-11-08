import { beforeAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import type {
  ApiErrorBody,
  MessageDTO,
  Paged,
  StaffRequestDTO,
  StaffRequestRowDTO,
  StaffRequestsDTO,
} from "@/contracts/api";
import { requests } from "@db/schema";
import { getDb } from "@/server/db";
import { apiAs, freezeTime, resetDb } from "../helpers/api";
import type { Fixtures } from "../helpers/fixtures";

// Тесты очереди заявок сотрудника (DS-30). Время заморожено до сида — даты детерминированы.
// Сид = демо-очередь Элены (4 новых/6 в работе/1 просрочена, SPEC §11.2) + популяция DS-40:
// 50 заявок в области Элены (студенческий офис, faculty_id IS NULL — все факультеты),
// среди них submitted 4, in_progress 6, needs_info 13, ready 2, issued 13, rejected 1, cancelled 11.
// У Олега (деканат ФМО) только фоновые заявки своей аудитории: 18 шт., групп Б-МН-101 и М-МН-111.
// Порядок важен: сначала список/карточка, потом переходы — они меняют статусы,
// и счётчики в списке после этого были бы другими.

const NOW = "2026-11-12T12:00:00+03:00"; // четверг

let fx: Fixtures;
beforeAll(async () => {
  freezeTime(NOW);
  fx = await resetDb();
});

/** id засеянной заявки по статусу (читаем владельцем БД, без RLS; переходы убирают статус из выборки). */
async function requestIdByStatus(status: (typeof requests.status.enumValues)[number]) {
  const [row] = await getDb()
    .select({ id: requests.id })
    .from(requests)
    .where(eq(requests.status, status))
    .orderBy(asc(requests.id))
    .limit(1);
  if (!row) throw new Error(`нет засеянной заявки в статусе ${status}`);
  return row.id;
}

describe("GET /api/staff/requests", () => {
  it("возвращает очередь в формате контракта; у Елены (студенческий офис) — все факультеты", async () => {
    const res = await apiAs("elena").get<StaffRequestsDTO>("/api/staff/requests");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    // дефолтный limit = 50 (максимум Paged): страницы по 50, всего 71 заявка
    expect(res.body.items).toHaveLength(50);
    expect(res.body.nextCursor).not.toBeNull();
    expect(res.body.counters).toEqual({ submitted: 4, inProgress: 6, overdue: 7 });
    expect(res.body.items[0]).toEqual(
      expect.objectContaining({
        number: expect.stringMatching(/^СП-\d{4}-\d{4}$/),
      }),
    );
  });

  it("фильтр status=submitted", async () => {
    const res = await apiAs("elena").get<StaffRequestsDTO>("/api/staff/requests?status=submitted");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(4);
    expect(res.body.items.every((r) => r.status === "submitted")).toBe(true);
  });

  it("фильтр type=study_cert", async () => {
    const res = await apiAs("elena").get<StaffRequestsDTO>("/api/staff/requests?type=study_cert");
    expect(res.body.items).toHaveLength(9); // справка Ани + фоновые
  });

  it("фильтр overdue=true: просрочены только открытые статусы", async () => {
    const res = await apiAs("elena").get<StaffRequestsDTO>("/api/staff/requests?overdue=true");
    expect(res.body.items).toHaveLength(7); // демо-просрочка + 6 needs_info популяции
    const okStatuses = ["submitted", "in_progress", "needs_info"];
    expect(res.body.items.every((r) => okStatuses.includes(r.status) && r.overdue)).toBe(true);
  });

  it("фильтр mine=true: только заявки, назначенные Елене", async () => {
    const res = await apiAs("elena").get<StaffRequestsDTO>(
      "/api/staff/requests?mine=true&limit=50",
    );
    expect(res.body.items).toHaveLength(50); // всего «моих» 52 — первая страница лимита
    expect(res.body.items.every((r) => r.assignee !== null)).toBe(true);
  });

  it("sort=dueAt идёт от ближайшего срока и пагинациируется без повторов", async () => {
    const first = await apiAs("elena").get<StaffRequestsDTO>(
      "/api/staff/requests?sort=dueAt&limit=5",
    );
    expect(first.body.items[0]).toEqual(expect.objectContaining({ status: "ready" }));
    const dueList = first.body.items.map((r) => r.dueAt);
    expect([...dueList].sort()).toEqual(dueList);

    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await apiAs("elena").get<StaffRequestsDTO>(
      `/api/staff/requests?sort=dueAt&limit=5&cursor=${first.body.nextCursor}`,
    );
    const seen = new Set([...first.body.items, ...second.body.items].map((r) => r.id));
    expect(seen.size).toBe(10);
    const all = [...first.body.items.map((r) => r.dueAt), ...second.body.items.map((r) => r.dueAt)];
    expect([...all].sort()).toEqual(all);
  });

  it("пагинация по умолчанию (createdAt desc) собирает все 71 без повторов", async () => {
    const ids: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    while (pages === 0 || cursor !== null) {
      const url: string = cursor
        ? `/api/staff/requests?limit=5&cursor=${cursor}`
        : "/api/staff/requests?limit=5";
      const res = await apiAs("elena").get<Paged<StaffRequestRowDTO>>(url);
      ids.push(...res.body.items.map((r) => r.id));
      cursor = res.body.nextCursor;
      pages += 1;
      if (pages > 20) throw new Error("пагинация не заканчивается");
    }
    expect(pages).toBe(15); // 71 заявка / по 5
    expect(ids).toHaveLength(new Set(ids).size);
  });

  it("невалидные параметры → 422 VALIDATION", async () => {
    for (const q of ["limit=0", "status=deleted", "sort=dueDate", "mine=1"]) {
      const res = await apiAs("elena").get<ApiErrorBody>(`/api/staff/requests?${q}`);
      expect(res.status, q).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION");
    }
  });

  it("Олег (деканат ФМО) видит только фоновые заявки своего факультета", async () => {
    const res = await apiAs("oleg").get<StaffRequestsDTO>("/api/staff/requests?limit=50");
    expect(res.status).toBe(200);
    expect(res.body.counters).toEqual({ submitted: 0, inProgress: 0, overdue: 3 });
    // фоновые студенты ФМО; заявки Ани (экономика) и её очереди — не в списке
    expect([...new Set(res.body.items.map((r) => r.student.group))].sort()).toEqual([
      "Б-МН-101",
      "М-МН-111",
    ]);
    const res2 = await apiAs("oleg").get<StaffRequestsDTO>("/api/staff/requests?status=submitted");
    expect(res2.body.items).toEqual([]); // у популяции нет submitted
  });
});

describe("GET /api/staff/requests/:id", () => {
  it("карточка: данные студента, поля, трекер, ответственный", async () => {
    const res = await apiAs("elena").get<StaffRequestDTO>(
      `/api/staff/requests/${fx.requests.anna[0]}`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: fx.requests.anna[0],
      type: { code: "study_cert", title: "Справка об обучении" },
      status: "in_progress",
      delivery: "electronic",
      copies: 1,
      fields: { destination: "По месту требования" },
      overdue: false,
      assignee: "Елена М.",
      student: {
        fullName: "Соколова Анна Дмитриевна",
        group: "Б-ЭК-101",
        program: "Экономика",
        course: 1,
      },
    });
    expect(res.body.events.map((e) => [e.fromStatus, e.toStatus, e.actor, e.actorName])).toEqual([
      [null, "submitted", "student", null],
      ["submitted", "in_progress", "staff", "Елена М."],
    ]);
    expect(res.body.messages).toEqual([]);
  });

  it("переписка с уточнением видна сотруднику", async () => {
    const res = await apiAs("elena").get<StaffRequestDTO>(
      `/api/staff/requests/${fx.requests.maxim[0]}`,
    );
    expect(res.body.status).toBe("needs_info");
    expect(res.body.messages).toEqual([
      expect.objectContaining({ author: "staff", authorName: "Елена М." }),
    ]);
  });

  it("Олег не видит заявку студента Экономики → тот же 404, что у несуществующего id", async () => {
    const res = await apiAs("oleg").get(`/api/staff/requests/${fx.requests.anna[0]}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND" } });
    for (const id of ["0b7f2c1e-4d6a-4c8e-9f3b-2a1d5e6f7a8b", "not-a-uuid"]) {
      const bad = await apiAs("elena").get(`/api/staff/requests/${id}`);
      expect(bad.status, id).toBe(404);
    }
  });
});

describe("POST /api/staff/requests/:id/transition", () => {
  it("проверка прав: студент → 403, гость → 401, чужой факультет → 404", async () => {
    const id = await requestIdByStatus("submitted");
    expect(
      (await apiAs("anna").post(`/api/staff/requests/${id}/transition`, { action: "take" })).status,
    ).toBe(403);
    expect(
      (await apiAs("guest").post(`/api/staff/requests/${id}/transition`, { action: "take" }))
        .status,
    ).toBe(401);
    expect(
      (await apiAs("oleg").post(`/api/staff/requests/${id}/transition`, { action: "take" })).status,
    ).toBe(404);
  });

  it("take на submitted назначает исполнителя и уводит в работу", async () => {
    const id = await requestIdByStatus("submitted");
    const res = await apiAs("elena").post<StaffRequestDTO>(`/api/staff/requests/${id}/transition`, {
      action: "take",
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "in_progress", assignee: "Елена М." });
    expect(res.body.events.at(-1)).toEqual(
      expect.objectContaining({
        fromStatus: "submitted",
        toStatus: "in_progress",
        actor: "staff",
        actorName: "Елена М.",
      }),
    );
  });

  it("need_info без comment → 422; с comment → needs_info", async () => {
    const id = await requestIdByStatus("submitted");
    expect(
      (await apiAs("elena").post(`/api/staff/requests/${id}/transition`, { action: "take" }))
        .status,
    ).toBe(200);

    const without = await apiAs("elena").post<ApiErrorBody>(
      `/api/staff/requests/${id}/transition`,
      {
        action: "need_info",
      },
    );
    expect(without.status).toBe(422);
    expect(without.body.error).toEqual({
      code: "VALIDATION",
      details: { reason: "COMMENT_REQUIRED" },
    });

    const withComment = await apiAs("elena").post<StaffRequestDTO>(
      `/api/staff/requests/${id}/transition`,
      { action: "need_info", comment: "Уточните адрес доставки" },
    );
    expect(withComment.status).toBe(200);
    expect(withComment.body.status).toBe("needs_info");
    expect(withComment.body.events.at(-1)).toEqual(
      expect.objectContaining({ toStatus: "needs_info", comment: "Уточните адрес доставки" }),
    );
  });

  it("reject без rejectReason и comment → 422; полный reject из in_progress → rejected", async () => {
    const id = await requestIdByStatus("submitted");
    expect(
      (await apiAs("elena").post(`/api/staff/requests/${id}/transition`, { action: "take" }))
        .status,
    ).toBe(200);

    const bare = await apiAs("elena").post<ApiErrorBody>(`/api/staff/requests/${id}/transition`, {
      action: "reject",
    });
    expect(bare.status).toBe(422);
    expect(bare.body.error.code).toBe("VALIDATION");

    const onlyReason = await apiAs("elena").post<ApiErrorBody>(
      `/api/staff/requests/${id}/transition`,
      {
        action: "reject",
        rejectReason: "NOT_ELIGIBLE",
      },
    );
    expect(onlyReason.status).toBe(422);

    const full = await apiAs("elena").post<StaffRequestDTO>(
      `/api/staff/requests/${id}/transition`,
      {
        action: "reject",
        rejectReason: "NOT_ELIGIBLE",
        comment: "Справка не выдаётся на 1 курсе",
      },
    );
    expect(full.status).toBe(200);
    expect(full.body.status).toBe("rejected");
    expect(full.body.events.at(-1)).toEqual(
      expect.objectContaining({ fromStatus: "in_progress", toStatus: "rejected" }),
    );
  });

  it("недопустимые переходы: take на needs_info и issue на submitted → 409 CONFLICT", async () => {
    const needsInfo = await requestIdByStatus("needs_info");
    const res = await apiAs("elena").post<ApiErrorBody>(
      `/api/staff/requests/${needsInfo}/transition`,
      {
        action: "take",
      },
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");

    const submitted = await requestIdByStatus("submitted");
    const issue = await apiAs("elena").post<ApiErrorBody>(
      `/api/staff/requests/${submitted}/transition`,
      {
        action: "issue",
      },
    );
    expect(issue.status).toBe(409);
  });

  it("issue из ready → issued", async () => {
    const id = await requestIdByStatus("ready");
    const res = await apiAs("elena").post<StaffRequestDTO>(`/api/staff/requests/${id}/transition`, {
      action: "issue",
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("issued");
    // событие в готовой «популяции» датировано позже замороженных часов, поэтому содержится в ленте
    expect(res.body.events).toContainEqual(
      expect.objectContaining({ fromStatus: "ready", toStatus: "issued", actor: "staff" }),
    );
  });
});

describe("POST /api/staff/requests/:id/messages", () => {
  it("валидация: пустое и слишком длинное тело → 422", async () => {
    const id = await requestIdByStatus("submitted");
    for (const body of [{ body: "" }, { body: "x".repeat(2001) }]) {
      const res = await apiAs("elena").post<ApiErrorBody>(
        `/api/staff/requests/${id}/messages`,
        body,
      );
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION");
    }
  });

  it("сообщение не меняет статус needs_info и возвращается как MessageDTO автора staff", async () => {
    const id = await requestIdByStatus("needs_info");
    const res = await apiAs("elena").post<MessageDTO>(`/api/staff/requests/${id}/messages`, {
      body: "Ждём ответа в течение дня",
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(
      expect.objectContaining({
        author: "staff",
        authorName: "Елена М.",
        body: "Ждём ответа в течение дня",
      }),
    );

    const card = await apiAs("elena").get<StaffRequestDTO>(`/api/staff/requests/${id}`);
    expect(card.body.status).toBe("needs_info");
    expect(card.body.messages.at(-1)).toEqual(
      expect.objectContaining({ body: "Ждём ответа в течение дня" }),
    );
  });

  it("в завершённых статусах переписка закрыта → 409", async () => {
    const id = await requestIdByStatus("rejected"); // создан reject-переходом выше
    const res = await apiAs("elena").post<ApiErrorBody>(`/api/staff/requests/${id}/messages`, {
      body: "Заявка закрыта",
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("студент → 403, гость → 401, Олегу чужая заявка → 404", async () => {
    const id = await requestIdByStatus("submitted");
    expect(
      (await apiAs("anna").post(`/api/staff/requests/${id}/messages`, { body: "текст" })).status,
    ).toBe(403);
    expect(
      (await apiAs("guest").post(`/api/staff/requests/${id}/messages`, { body: "текст" })).status,
    ).toBe(401);
    expect(
      (await apiAs("oleg").post(`/api/staff/requests/${id}/messages`, { body: "текст" })).status,
    ).toBe(404);
  });
});
