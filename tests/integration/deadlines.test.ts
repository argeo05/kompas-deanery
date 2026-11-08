import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as s from "@db/schema";
import type {
  ApiErrorBody,
  DeadlinesDTO,
  DeadlineDTO,
  DeadlineWindowsDTO,
  PlanDTO,
} from "@/contracts/api";
import { getDb } from "@/server/db";
import { apiAs, freezeTime, resetDb } from "../helpers/api";
import type { Fixtures } from "../helpers/fixtures";

// Тесты дедлайнов и планов (DS-15). Время заморожено до сида — даты детерминированы.
// Сид (demo-accounts.ts) при замороженном «12.11, четверг, 12:00 МСК» даёт Ане:
//   hot:   «Эссе по денежной политике» (assessment, Макроэкономика, срок завтра 23:59), звёздочка;
//   week:  «Вопросы к консультации по микроэкономике» (personal, без курса);
//   later: «Выбор курсов по выбору на весенний семестр» (admin);
// Максиму — «Итоговый проект по медиааналитике» (later, чужой для Ани).

const NOW = "2026-11-12T12:00:00+03:00"; // четверг
const HOUR = 3_600_000;
const draftDeadlineIds: string[] = [];

let fx: Fixtures;

const isoIn = (hours: number) => new Date(new Date(NOW).getTime() + hours * HOUR).toISOString();

const find = (title: string, list: DeadlineDTO[]) => list.find((d) => d.title === title);
const all = (dto: DeadlinesDTO) => [...Object.values(dto.groups)].flat();

beforeAll(async () => {
  freezeTime(NOW);
  fx = await resetDb();
});

/** Свежий личный дедлайн Ани: изменяющие проверки не зависят друг от друга и от порядка тестов. */
const freshDeadline = async (dueIn = 60): Promise<DeadlineDTO> => {
  const res = await apiAs("anna").post<DeadlineDTO>("/api/me/deadlines", {
    title: `Тестовая задача ${Math.random().toString(36).slice(2, 10)}`,
    dueAt: isoIn(dueIn),
  });
  draftDeadlineIds.push(res.body.id);
  return res.body;
};

describe("GET /api/me/deadlines", () => {
  it("раскладывает сид-дедлайны Ани по группам hot/week/later", async () => {
    const res = await apiAs("anna").get<DeadlinesDTO>("/api/me/deadlines");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");

    expect(find("Эссе по денежной политике", res.body.groups.hot)).toMatchObject({
      source: "assessment",
      courseTitle: "Макроэкономика",
      dueAt: "2026-11-13T23:59:00+03:00",
      starred: true,
      done: false,
      risk: true, // ≤ 48 ч
      plan: null,
    });
    expect(find("Вопросы к консультации по микроэкономике", res.body.groups.week)).toMatchObject({
      source: "personal",
      courseTitle: null,
      starred: false,
      risk: false,
    });
    expect(find("Выбор курсов по выбору на весенний семестр", res.body.groups.later)).toMatchObject(
      {
        source: "admin",
        risk: false,
      },
    );
    expect(res.body.groups.done).toEqual([]);
  });

  it("done переносит дедлайн в группу «Сделано», undone возвращает в активные", async () => {
    const dto = await freshDeadline(6);
    const mark = await apiAs("anna").post<DeadlineDTO>(`/api/me/deadlines/${dto.id}/done`);
    expect(mark.status).toBe(200);
    expect(mark.body.done).toBe(true);
    expect(mark.body.risk).toBe(false); // сделанное не «горит»

    const doneView = await apiAs("anna").get<DeadlinesDTO>("/api/me/deadlines?status=done");
    expect(doneView.body.groups.hot).toEqual([]);
    expect(doneView.body.groups.week).toEqual([]);
    expect(doneView.body.groups.later).toEqual([]);
    expect(doneView.body.groups.done).toEqual([
      expect.objectContaining({ id: dto.id, done: true }),
    ]);

    const activeView = await apiAs("anna").get<DeadlinesDTO>("/api/me/deadlines?status=active");
    expect(activeView.body.groups.done).toEqual([]);
    expect(find("Эссе по денежной политике", activeView.body.groups.hot)).toBeDefined();

    await apiAs("anna").post(`/api/me/deadlines/${dto.id}/undone`);
    const again = await apiAs("anna").get<DeadlinesDTO>("/api/me/deadlines");
    const undone = all(again.body).find((d) => d.id === dto.id);
    expect(undone).toMatchObject({ done: false, risk: true });
    expect(again.body.groups.hot).toContainEqual(expect.objectContaining({ id: dto.id }));
  });

  it("Максим не видит дедлайны Ани, даже если подставить её studentId", async () => {
    const res = await apiAs("maxim").get<DeadlinesDTO>(
      `/api/me/deadlines?studentId=${fx.users.anna}`,
    );
    expect(res.status).toBe(200);
    const titles = all(res.body).map((d) => d.title);
    expect(titles).toEqual(["Итоговый проект по медиааналитике"]);
    expect(all(res.body).find((d) => draftDeadlineIds.includes(d.id))).toBeUndefined();
  });

  it("гость → 401, сотрудник → 403, невалидный status → 422", async () => {
    expect((await apiAs("guest").get("/api/me/deadlines")).status).toBe(401);
    const staff = await apiAs("elena").get<ApiErrorBody>("/api/me/deadlines");
    expect(staff.status).toBe(403);
    expect(staff.body.error.code).toBe("FORBIDDEN");
    const badStatus = await apiAs("anna").get<ApiErrorBody>("/api/me/deadlines?status=someday");
    expect(badStatus.status).toBe(422);
    expect(badStatus.body.error.code).toBe("VALIDATION");
  });
});

describe("POST /api/me/deadlines", () => {
  it("создаёт личный дедлайн: personal, без звёздочки; срок ≤ 48 ч → hot и риск", async () => {
    const res = await apiAs("anna").post<DeadlineDTO>("/api/me/deadlines", {
      title: "Подготовить доклад к круглому столу",
      dueAt: isoIn(12),
    });
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.body).toMatchObject({
      source: "personal",
      courseTitle: null,
      starred: false,
      done: false,
      risk: true, // срок через 12 ч
      plan: null,
    });
    draftDeadlineIds.push(res.body.id);

    const list = await apiAs("anna").get<DeadlinesDTO>("/api/me/deadlines?status=active");
    expect(list.body.groups.hot).toContainEqual(expect.objectContaining({ id: res.body.id }));
  });

  it("валидация: длина заголовка и формат срока → 422", async () => {
    for (const body of [
      { title: "", dueAt: isoIn(12) },
      { title: "x".repeat(121), dueAt: isoIn(12) },
      { title: "Без срока" },
      { title: "не дата", dueAt: "завтра" },
    ]) {
      const res = await apiAs("anna").post<ApiErrorBody>("/api/me/deadlines", body);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION");
    }
  });

  it("гость → 401, сотрудник → 403", async () => {
    expect(
      (await apiAs("guest").post("/api/me/deadlines", { title: "x", dueAt: isoIn(1) })).status,
    ).toBe(401);
    expect(
      (await apiAs("elena").post("/api/me/deadlines", { title: "x", dueAt: isoIn(1) })).status,
    ).toBe(403);
  });
});

describe("POST /api/me/deadlines/:id/star|unstar", () => {
  it("star/unstar переключают звёздочку", async () => {
    const dto = await freshDeadline();
    const starred = await apiAs("anna").post<DeadlineDTO>(`/api/me/deadlines/${dto.id}/star`);
    expect(starred.status).toBe(200);
    expect(starred.body.starred).toBe(true);
    const unstarred = await apiAs("anna").post<DeadlineDTO>(`/api/me/deadlines/${dto.id}/unstar`);
    expect(unstarred.body.starred).toBe(false);
  });

  it("чужой, несуществующий и «кривой» id → 404 NOT_FOUND", async () => {
    const dto = await freshDeadline();
    const foreign = await apiAs("maxim").post<ApiErrorBody>(`/api/me/deadlines/${dto.id}/star`);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("NOT_FOUND");

    for (const id of ["0b7f2c1e-4d6a-4c8e-9f3b-2a1d5e6f7a8b", "not-a-uuid"]) {
      const res = await apiAs("anna").post<ApiErrorBody>(`/api/me/deadlines/${id}/unstar`);
      expect(res.status, id).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    }
  });

  it("гость → 401, сотрудник → 403", async () => {
    const dto = await freshDeadline();
    expect((await apiAs("guest").post(`/api/me/deadlines/${dto.id}/star`)).status).toBe(401);
    expect((await apiAs("elena").post(`/api/me/deadlines/${dto.id}/star`)).status).toBe(403);
  });
});

describe("GET /api/me/deadlines/:id/windows", () => {
  it("3 окна: возрастают, не раньше now, длина ≥ 60 мин, форма +03:00", async () => {
    const dto = await freshDeadline();
    const res = await apiAs("anna").get<DeadlineWindowsDTO>(`/api/me/deadlines/${dto.id}/windows`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.body.windows).toHaveLength(3);
    let prevEnd = "";
    for (const w of res.body.windows) {
      expect(w.startsAt).toMatch(/\+03:00$/);
      expect(w.endsAt).toMatch(/\+03:00$/);
      expect(w.startsAt >= NOW).toBe(true);
      expect(w.startsAt >= prevEnd).toBe(true);
      expect(new Date(w.endsAt).getTime() - new Date(w.startsAt).getTime()).toBeGreaterThanOrEqual(
        HOUR, // 60 минут — minMinutes по DS-05
      );
      prevEnd = w.endsAt;
    }
  });

  it("Максим не получает окна по дедлайну Ани → 404", async () => {
    const dto = await freshDeadline();
    const res = await apiAs("maxim").get<ApiErrorBody>(`/api/me/deadlines/${dto.id}/windows`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("гость → 401, сотрудник → 403", async () => {
    const dto = await freshDeadline();
    expect((await apiAs("guest").get(`/api/me/deadlines/${dto.id}/windows`)).status).toBe(401);
    expect((await apiAs("elena").get(`/api/me/deadlines/${dto.id}/windows`)).status).toBe(403);
  });
});

describe("POST /api/me/plans, DELETE /api/me/plans/:id", () => {
  const planBody = (deadlineId: string, h = 24) => ({
    deadlineId,
    startsAt: isoIn(h),
    endsAt: isoIn(h + 1),
    place: "Библиотека",
    firstAction: "Открыть черновик",
  });

  it("дедлайн без звёздочки и без риска → 422 VALIDATION reason NOT_STARRED", async () => {
    const dto = await freshDeadline(72); // далеко за «горит»
    const res = await apiAs("anna").post<ApiErrorBody>("/api/me/plans", planBody(dto.id));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION");
    expect((res.body.error.details as { reason?: string }).reason).toBe("NOT_STARRED");
  });

  it("после star → 201; DeadlineDTO.plan показывает план; в notifications есть напоминание", async () => {
    const dto = await freshDeadline(72);
    await apiAs("anna").post(`/api/me/deadlines/${dto.id}/star`);
    const res = await apiAs("anna").post<PlanDTO>("/api/me/plans", planBody(dto.id, 34));
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.body.place).toBe("Библиотека");
    expect(res.body.startsAt).toMatch(/\+03:00$/);

    const list = await apiAs("anna").get<DeadlinesDTO>("/api/me/deadlines");
    expect(all(list.body).find((d) => d.id === dto.id)).toMatchObject({
      starred: true,
      plan: res.body,
    });

    const [row] = await getDb()
      .select()
      .from(s.notifications)
      .where(
        and(
          eq(s.notifications.userId, fx.users.anna),
          eq(s.notifications.category, "plan"),
          eq(s.notifications.linkId, dto.id),
        ),
      );
    expect(row).toMatchObject({ class: "personal", linkKind: "deadline", readAt: null });
  });

  it("дедлайн в риске без звёздочки тоже допускает план; кривое окно → 422", async () => {
    const hot = await freshDeadline(8); // ≤ 48 ч → risk без star
    const res = await apiAs("anna").post<PlanDTO>("/api/me/plans", planBody(hot.id, 14));
    expect(res.status).toBe(201);

    const backwards = await apiAs("anna").post<ApiErrorBody>("/api/me/plans", {
      ...planBody(hot.id, 16),
      endsAt: isoIn(15), // окно раньше начала
    });
    expect(backwards.status).toBe(422);
    const emptyPlace = await apiAs("anna").post<ApiErrorBody>("/api/me/plans", {
      ...planBody(hot.id, 16),
      place: "  ",
    });
    expect(emptyPlace.status).toBe(422);
  });

  it("второй план к тому же дедлайну возможен (в schema нет unique по deadlineId)", async () => {
    const dto = await freshDeadline(72);
    await apiAs("anna").post(`/api/me/deadlines/${dto.id}/star`);
    expect((await apiAs("anna").post<PlanDTO>("/api/me/plans", planBody(dto.id, 40))).status).toBe(
      201,
    );
    expect((await apiAs("anna").post<PlanDTO>("/api/me/plans", planBody(dto.id, 50))).status).toBe(
      201,
    );
    const list = await apiAs("anna").get<DeadlinesDTO>("/api/me/deadlines");
    expect(list.status).toBe(200);
  });

  it("чужой или несуществующий deadlineId в теле → 404 NOT_FOUND", async () => {
    const annaEssay = find(
      "Эссе по денежной политике",
      (await apiAs("anna").get<DeadlinesDTO>("/api/me/deadlines")).body.groups.hot,
    )!;

    const foreign = await apiAs("maxim").post<ApiErrorBody>(
      "/api/me/plans",
      planBody(annaEssay.id),
    );
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("NOT_FOUND");

    const ghost = await apiAs("anna").post<ApiErrorBody>(
      "/api/me/plans",
      planBody("0b7f2c1e-4d6a-4c8e-9f3b-2a1d5e6f7a8b"),
    );
    expect(ghost.status).toBe(404);
  });

  it("DELETE: владелец → 204, повторно → 404, Максиму → 404", async () => {
    const dto = await freshDeadline(72);
    await apiAs("anna").post(`/api/me/deadlines/${dto.id}/star`);
    const plan = await apiAs("anna").post<PlanDTO>("/api/me/plans", planBody(dto.id, 44));

    const foreign = await apiAs("maxim").delete<ApiErrorBody>(`/api/me/plans/${plan.body.id}`);
    expect(foreign.status).toBe(404);

    const deleted = await apiAs("anna").delete(`/api/me/plans/${plan.body.id}`);
    expect(deleted.status).toBe(204);
    expect((await apiAs("anna").delete<ApiErrorBody>(`/api/me/plans/${plan.body.id}`)).status).toBe(
      404,
    );

    const list = await apiAs("anna").get<DeadlinesDTO>("/api/me/deadlines");
    expect(all(list.body).find((d) => d.id === dto.id)).toMatchObject({ plan: null });
  });

  it("гость → 401, сотрудник → 403", async () => {
    expect((await apiAs("guest").post("/api/me/plans", {})).status).toBe(401);
    expect((await apiAs("elena").post("/api/me/plans", { deadlineId: "0" })).status).toBe(403);
  });
});
