import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type {
  ApiErrorBody,
  RequestDetailDTO,
  RequestDTO,
  RequestMessageCreatedDTO,
} from "@/contracts/api";
import { formatRequestNumber } from "@/lib/request-number";
import { getDb } from "@/server/db";
import { requests } from "../../db/schema";
import { apiAs, freezeTime, resetDb } from "../helpers/api";
import type { Fixtures } from "../helpers/fixtures";

// DS-17 · Создание, отмена, переписка, повторная подача и data-fix.
// Время заморожено до сида (сегодня = 2026-11-12, четверг, 12:00 МСК) — даты детерминированы.
// Порядок описов важен: сначала все тесты создания Ани (квота 10/ч), лимит — последний по Максиму.

const NOW = "2026-11-12T12:00:00+03:00";

const idem = (key: string) => ({ "Idempotency-Key": key });
// четверг

let fx: Fixtures;
beforeAll(async () => {
  freezeTime(NOW);
  fx = await resetDb();
});

const CREATE_BODY = {
  typeCode: "study_cert",
  delivery: "electronic",
  copies: 1,
  fields: { destination: "Банк «Демо»" },
};

let annaCreatedId = ""; // создание из первого теста describe «создание»
let annaCancelId = ""; // для повторной отмены

/** Отклонённая заявка напрямую (как делает сид): нужен для resubmit — у Ани в сиде отклонённых нет. */
async function seedRejectedRequest(studentId: string, typeCode: string) {
  const db = getDb();
  const at = new Date("2026-11-10T15:00:00+03:00");
  const [{ seq }] = await db.execute<{ seq: string }>(
    sql`SELECT nextval('request_number_seq') AS seq`,
  );
  const [row] = await db
    .insert(requests)
    .values({
      number: formatRequestNumber(at, Number(seq)),
      studentId,
      typeCode,
      status: "rejected",
      rejectReason: "INCOMPLETE",
      payload: { destination: "Старый адрес" },
      delivery: "electronic",
      copies: 1,
      createdAt: at,
      dueAt: new Date("2026-11-12T18:00:00+03:00"),
      updatedAt: at,
      studentSeenAt: at,
    })
    .returning({ id: requests.id });
  return row.id;
}

describe("POST /api/me/requests (создание)", () => {
  it("201, формат номера СП-ГГММ-NNNN, срок = 18:00 МСК N-го рабочего дня", async () => {
    const res = await apiAs("anna").post<RequestDTO>("/api/me/requests", CREATE_BODY, {
      headers: { "Idempotency-Key": "ds17-create-key1" },
    });
    expect(res.status).toBe(201);
    annaCreatedId = res.body.id;
    expect(res.body.number).toMatch(/^СП-2611-\d{4}$/); // 26/11 — г/м подачи по Москве
    expect(new Date(res.body.createdAt).getTime()).toBe(new Date(NOW).getTime());
    expect(res.body.dueAt).toBe("2026-11-13T18:00:00+03:00"); // study_cert: SLA 1 раб. день
    expect(res.body.type).toEqual({ code: "study_cert", title: "Справка об обучении" });
    expect(res.body.status).toBe("submitted");
    expect(res.body.delivery).toBe("electronic");
    expect(res.body.copies).toBe(1);
    expect(res.body.resubmittedFrom).toBeNull();
    expect(res.body.overdue).toBe(false);
    expect(res.body.unseen).toBe(false); // создал сам студент
  });

  it("повтор с тем же ключом и телом → тот же ответ (идемпотентность)", async () => {
    const res = await apiAs("anna").post<RequestDTO>("/api/me/requests", CREATE_BODY, {
      headers: { "Idempotency-Key": "ds17-create-key1" },
    });
    expect(res.status).toBe(201);
    expect(res.headers.get("Idempotent-Replayed")).toBe("true");
    expect(res.body.id).toBe(annaCreatedId);
  });

  it("тот же ключ с другим телом → 422 IDEMPOTENCY_KEY_REUSED", async () => {
    const other = await apiAs("anna").post<ApiErrorBody>(
      "/api/me/requests",
      { ...CREATE_BODY, copies: 2 },
      { headers: { "Idempotency-Key": "ds17-create-key1" } },
    );
    expect(other.status).toBe(422);
    expect(other.body.error.code).toBe("VALIDATION");
    expect(other.body.error.details).toEqual({ reason: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("без заголовка Idempotency-Key → 422", async () => {
    const res = await apiAs("anna").post<ApiErrorBody>("/api/me/requests", CREATE_BODY);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION");
    expect(res.body.error.details).toEqual({ reason: "IDEMPOTENCY_KEY_REQUIRED" });
  });

  it("обязательное поле оставлен пустым → 201 (обязательность откладывается до needs_info, fields {})", async () => {
    // Манифест изоляции отправляет fields: {} и ждёт 2xx: неполная заявка валидна как
    // submitted; доработка полей — через needs_info/студентский ответ (SPEC §6.5).
    const res = await apiAs("anna").post<RequestDTO>(
      "/api/me/requests",
      { ...CREATE_BODY, fields: {} },
      { headers: idem("ds17-fields-req") },
    );
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("submitted");
  });

  it("неизвестное поле и значение select не из options → 422", async () => {
    const unknown = await apiAs("anna").post<ApiErrorBody>(
      "/api/me/requests",
      { ...CREATE_BODY, fields: { destination: "Банк", extra: "лишнее" } },
      { headers: { "Idempotency-Key": "ds17-fields-unk" } },
    );
    expect(unknown.status).toBe(422);
    expect(unknown.body.error.code).toBe("VALIDATION");

    const badOption = await apiAs("anna").post<ApiErrorBody>(
      "/api/me/requests",
      {
        typeCode: "dorm_cert",
        delivery: "electronic",
        copies: 1,
        fields: { destination: "что-то другое" },
      },
      { headers: { "Idempotency-Key": "ds17-fields-sel" } },
    );
    const issues = (badOption.body.error.details as { issues: Array<{ path: string }> }).issues;
    expect(issues).toEqual([{ path: "fields.destination", code: "invalid_option" }]);
  });

  it("unknown typeCode → 404 NOT_FOUND", async () => {
    const res = await apiAs("anna").post<ApiErrorBody>(
      "/api/me/requests",
      { ...CREATE_BODY, typeCode: "no_such_type" },
      { headers: { "Idempotency-Key": "ds17-type-404" } },
    );
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND" } });
  });

  it("delivery вне deliveryOptions типа → 422", async () => {
    const res = await apiAs("anna").post<ApiErrorBody>(
      "/api/me/requests",
      {
        typeCode: "app_free",
        delivery: "electronic",
        copies: 1,
        fields: { body: "Прошу перенести консультацию на другую неделю." }, // gitleaks:allow —之名 поля из formSchema сида
      },
      { headers: idem("ds17-delivery-bad") }, // gitleaks:allow — REST-заголовок, не секрет
    );
    expect(res.status).toBe(422);
    const issues = (res.body.error.details as { issues: Array<{ path: string }> }).issues;
    expect(issues).toEqual([{ path: "delivery", code: "not_available" }]);
  });

  it("studentId из тела игнорируется: Максим создаёт только свою заявку", async () => {
    const res = await apiAs("maxim").post<RequestDTO>(
      "/api/me/requests",
      { ...CREATE_BODY, studentId: fx.users.anna },
      { headers: idem("ds17-owner-try1") }, // gitleaks:allow — REST-заголовок, не секрет
    );
    expect(res.status).toBe(201);
    const mine = await apiAs("maxim").get<{ items: RequestDTO[] }>("/api/me/requests");
    expect(mine.body.items.map((r) => r.id)).toContain(res.body.id);
    const hers = await apiAs("anna").get<{ items: RequestDTO[] }>("/api/me/requests");
    expect(hers.body.items.map((r) => r.id)).not.toContain(res.body.id);
  });

  it("гость → 401, сотрудник → 403 на создание", async () => {
    expect(
      (
        await apiAs("guest").post("/api/me/requests", CREATE_BODY, {
          headers: { "Idempotency-Key": "ds17-guest-01" },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await apiAs("elena").post("/api/me/requests", CREATE_BODY, {
          headers: { "Idempotency-Key": "ds17-staff-01" },
        })
      ).status,
    ).toBe(403);
  });
});

describe("POST /api/me/requests/:id/cancel", () => {
  it("отмена своей заявки из submitted → 200, статус cancelled", async () => {
    const created = await apiAs("anna").post<RequestDTO>("/api/me/requests", CREATE_BODY, {
      headers: { "Idempotency-Key": "ds17-cancel-key1" },
    });
    expect(created.status).toBe(201);
    annaCancelId = created.body.id;
    const res = await apiAs("anna").post<RequestDTO>(`/api/me/requests/${annaCancelId}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
    expect(res.body.id).toBe(annaCancelId);
  });

  it("повторная отмена → 409 CONFLICT", async () => {
    const res = await apiAs("anna").post<ApiErrorBody>(`/api/me/requests/${annaCancelId}/cancel`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("отмена заявки с needs_info → 409 (cancel только из submitted)", async () => {
    const res = await apiAs("maxim").post<ApiErrorBody>(
      `/api/me/requests/${fx.requests.maxim[0]}/cancel`,
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("Максим не отменяет заявку Ани → 404 (чужое = несуществующее)", async () => {
    const res = await apiAs("maxim").post<ApiErrorBody>(
      `/api/me/requests/${fx.requests.anna[0]}/cancel`,
    );
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND" } });
  });

  it("несуществующий id, гость → 401, сотрудник → 403", async () => {
    const nobody = "0b7f2c1e-4d6a-4c8e-9f3b-2a1d5e6f7a8b";
    expect((await apiAs("anna").post(`/api/me/requests/${nobody}/cancel`)).status).toBe(404);
    expect((await apiAs("guest").post(`/api/me/requests/${nobody}/cancel`)).status).toBe(401);
    expect((await apiAs("elena").post(`/api/me/requests/${nobody}/cancel`)).status).toBe(403);
  });
});

describe("POST /api/me/requests/:id/messages", () => {
  it("student_reply при needs_info меняет статус на in_progress и пишет событие", async () => {
    const res = await apiAs("maxim").post<RequestMessageCreatedDTO>(
      `/api/me/requests/${fx.requests.maxim[0]}/messages`,
      { body: "Нужна выписка за все семестры." },
    );
    expect(res.status).toBe(201);
    expect(res.body.message).toMatchObject({ author: "student", authorName: "Максим" });
    expect(res.body.message.body).toBe("Нужна выписка за все семестры.");
    expect(res.body.request.status).toBe("in_progress");

    const detail = await apiAs("maxim").get<RequestDetailDTO>(
      `/api/me/requests/${fx.requests.maxim[0]}`,
    );
    expect(detail.body.status).toBe("in_progress");
    expect(detail.body.events.at(-1)).toMatchObject({
      fromStatus: "needs_info",
      toStatus: "in_progress",
      actor: "student",
    });
    expect(detail.body.messages.at(-1)).toMatchObject({ author: "student", authorName: "Максим" });
  });

  it("в статусе submitted сообщение статус не меняет", async () => {
    const created = await apiAs("anna").post<RequestDTO>("/api/me/requests", CREATE_BODY, {
      headers: { "Idempotency-Key": "ds17-msg-target" },
    });
    expect(created.status).toBe(201);
    const res = await apiAs("anna").post<RequestMessageCreatedDTO>(
      `/api/me/requests/${created.body.id}/messages`,
      { body: "Уточню, что справка нужна срочно." },
    );
    expect(res.status).toBe(201);
    expect(res.body.request.status).toBe("submitted");
    expect(res.body.request.unseen).toBe(false); // своё сообщение не ставит точку
  });

  it("пустое и слишком длинное тело → 422", async () => {
    const id = fx.requests.anna[0];
    const empty = await apiAs("anna").post<ApiErrorBody>(`/api/me/requests/${id}/messages`, {
      body: "   ",
    });
    expect(empty.status).toBe(422);
    expect(empty.body.error.code).toBe("VALIDATION");
    const long = await apiAs("anna").post<ApiErrorBody>(`/api/me/requests/${id}/messages`, {
      body: "х".repeat(2001),
    });
    expect(long.status).toBe(422);
  });

  it("Максим не пишет в заявку Ани → 404", async () => {
    const res = await apiAs("maxim").post<ApiErrorBody>(
      `/api/me/requests/${fx.requests.anna[0]}/messages`,
      { body: "чужая заявка" },
    );
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND" } });
  });

  it("гость → 401, сотрудник → 403", async () => {
    const id = fx.requests.anna[0];
    expect(
      (await apiAs("guest").post(`/api/me/requests/${id}/messages`, { body: "x" })).status,
    ).toBe(401);
    expect(
      (await apiAs("elena").post(`/api/me/requests/${id}/messages`, { body: "x" })).status,
    ).toBe(403);
  });
});

describe("POST /api/me/requests/:id/resubmit", () => {
  it("из rejected создаёт НОВУЮ заявку: resubmittedFrom, перезапись полей", async () => {
    const rejectedId = await seedRejectedRequest(fx.users.anna, "study_cert");
    const res = await apiAs("anna").post<RequestDTO>(
      `/api/me/requests/${rejectedId}/resubmit`,
      { fields: { destination: "Новый адрес" } },
      { headers: { "Idempotency-Key": "ds17-resubmit-key1" } },
    );
    expect(res.status).toBe(201);
    const dto = res.body;
    expect(dto.id).not.toBe(rejectedId);
    expect(dto.resubmittedFrom).toBe(rejectedId);
    expect(dto.status).toBe("submitted");
    expect(dto.number).toMatch(/^СП-2611-\d{4}$/);
    expect(dto.dueAt).toBe("2026-11-13T18:00:00+03:00");
    expect(dto.type.code).toBe("study_cert");
    expect(dto.delivery).toBe("electronic");
    expect(dto.copies).toBe(1);

    const detail = await apiAs("anna").get<RequestDetailDTO>(`/api/me/requests/${dto.id}`);
    expect(detail.body.fields).toEqual({ destination: "Новый адрес" }); // перезапись поверх старых
    expect(detail.body.events[0]).toMatchObject({
      fromStatus: null,
      toStatus: "submitted",
      actor: "student",
    });
    // Исходная заявка остаётся отклонённой.
    const original = await apiAs("anna").get<RequestDetailDTO>(`/api/me/requests/${rejectedId}`);
    expect(original.body.status).toBe("rejected");
  });

  it("из submitted → 409 CONFLICT", async () => {
    const created = await apiAs("anna").post<RequestDTO>("/api/me/requests", CREATE_BODY, {
      headers: { "Idempotency-Key": "ds17-resubmit-src" },
    });
    expect(created.status).toBe(201);
    const res = await apiAs("anna").post<ApiErrorBody>(
      `/api/me/requests/${created.body.id}/resubmit`,
      {},
      { headers: { "Idempotency-Key": "ds17-resubmit-typo" } },
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("Максим не переотправляет заявку Ани → 404; гость 401; сотрудник 403", async () => {
    const rejectedId = await seedRejectedRequest(fx.users.anna, "study_cert");
    expect(
      (
        await apiAs("maxim").post(
          `/api/me/requests/${rejectedId}/resubmit`,
          {},
          {
            headers: { "idempotency-key": randomUUID() },
          },
        )
      ).status,
    ).toBe(404);
    expect((await apiAs("guest").post(`/api/me/requests/${rejectedId}/resubmit`, {})).status).toBe(
      401,
    );
    expect((await apiAs("elena").post(`/api/me/requests/${rejectedId}/resubmit`, {})).status).toBe(
      403,
    );
  });
});

describe("POST /api/me/data-fix", () => {
  it("201: заявка типа data_fix, delivery null, copies 1", async () => {
    const res = await apiAs("anna").post<RequestDTO>(
      "/api/me/data-fix",
      { field: "contacts", comment: "Телефон в профиле больше не действует" },
      { headers: idem("ds17-datafix-ok") }, // gitleaks:allow — REST-заголовок, не секрет
    );
    expect(res.status).toBe(201);
    expect(res.body.type).toEqual({ code: "data_fix", title: "Исправление личных данных" });
    expect(res.body.delivery).toBeNull();
    expect(res.body.copies).toBe(1);
    expect(res.body.status).toBe("submitted");
    expect(res.body.number).toMatch(/^СП-2611-\d{4}$/);
    expect(res.body.dueAt).toBe("2026-11-17T18:00:00+03:00"); // SLA data_fix = 3 раб. дня: пт, пн, вт
    const detail = await apiAs("anna").get<RequestDetailDTO>(`/api/me/requests/${res.body.id}`);
    expect(detail.body.fields).toEqual({
      field: "contacts",
      comment: "Телефон в профиле больше не действует",
    });
  });

  it("невалидное поле и пустой комментарий → 422", async () => {
    const badField = await apiAs("anna").post<ApiErrorBody>(
      "/api/me/data-fix",
      { field: "nickname", comment: "x" },
      { headers: idem("ds17-datafix-bad1") }, // gitleaks:allow — REST-заголовок, не секрет
    );
    expect(badField.status).toBe(422);
    expect(badField.body.error.code).toBe("VALIDATION");
    const empty = await apiAs("anna").post<ApiErrorBody>(
      "/api/me/data-fix",
      { field: "group", comment: "   " },
      { headers: idem("ds17-datafix-bad2") }, // gitleaks:allow — REST-заголовок, не секрет
    );
    expect(empty.status).toBe(422);
    // Без Idempotency-Key заявка не создаётся (ревью Claude, .claude/rules/api.md).
    const noKey = await apiAs("anna").post<ApiErrorBody>("/api/me/data-fix", {
      field: "group",
      comment: "Не та группа",
    });
    expect(noKey.status).toBe(422);
    expect(noKey.body.error.details).toMatchObject({ reason: "IDEMPOTENCY_KEY_REQUIRED" });
  });

  it("гость → 401, сотрудник → 403", async () => {
    expect(
      (await apiAs("guest").post("/api/me/data-fix", { field: "other", comment: "x" })).status,
    ).toBe(401);
    expect(
      (await apiAs("elena").post("/api/me/data-fix", { field: "other", comment: "x" })).status,
    ).toBe(403);
  });
});

describe("лимит 10 заявок в час на студента → 429 RATE_LIMITED", () => {
  it("на 11-й заявке в час: все дальнейшие — RATE_LIMITED", async () => {
    // Максим уже потратил 1 квоту («studentId из тела игнорируется»): до лимита останется 9.
    const statuses: number[] = [];
    for (let i = 1; i <= 11; i++) {
      const res = await apiAs("maxim").post<ApiErrorBody>("/api/me/requests", CREATE_BODY, {
        headers: {
          "Idempotency-Key": `ds17-limit-${String(i).padStart(2, "0")}`,
        },
      });
      statuses.push(res.status);
    }
    const first429 = statuses.indexOf(429);
    expect(first429).toBeGreaterThan(-1);
    expect(first429).toBeLessThanOrEqual(9); // 1 заявка ранее — квота не обнулилась
    for (let i = first429; i < statuses.length; i++) expect(statuses[i]).toBe(429);
    expect(statuses.slice(0, first429).every((s) => s === 201)).toBe(true);
    const last = await apiAs("anna").post<ApiErrorBody>(
      // лимит персональный: у Ани своя квота, израсходовано 7 из 10 — 201
      "/api/me/requests",
      CREATE_BODY,
      { headers: { "Idempotency-Key": "ds17-limit-anna" } },
    );
    expect(last.status).toBe(201);
  });
});
