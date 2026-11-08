import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type {
  AnnouncementAudience,
  AnnouncementCreateBody,
  AnnouncementDTO,
  ApiErrorBody,
  Paged,
  StaffAnnouncementDTO,
} from "@/contracts/api";
import { notifications, faculties, groups } from "@db/schema";
import { getDb } from "@/server/db";
import { apiAs, freezeTime, resetDb } from "../helpers/api";
import type { Fixtures } from "../helpers/fixtures";

// Интеграционные тесты объявлений (DS-31). Тексты объявлений — нейтральные тестовые;
// важные проверки: аудитория (Г1 ≠ Г2, AC-6.1), модель области видимости сотрудника,
// сроки публикации/истечения, архив, уведомления (important → urgent) и роли.

const NOW = "2026-11-12T12:00:00+03:00"; // четверг

let fx: Fixtures;
let annaGroupId: string;
let maximGroupId: string;
let econFacultyId: string;
let intlFacultyId: string;

beforeAll(async () => {
  freezeTime(NOW);
  fx = await resetDb();
  const db = getDb();
  const groupsAll = await db
    .select({ id: groups.id, title: groups.title })
    .from(groups)
    .orderBy(groups.title);
  annaGroupId = groupsAll.find((g) => g.title === "Б-ЭК-101")!.id;
  maximGroupId = groupsAll.find((g) => g.title === "М-ЦМ-11")!.id;
  const facAll = await db
    .select({ id: faculties.id, code: faculties.code })
    .from(faculties)
    .orderBy(faculties.code);
  econFacultyId = facAll.find((f) => f.code === "EK")!.id;
  intlFacultyId = facAll.find((f) => f.code === "MO")!.id;
});

type StaffPage = Paged<StaffAnnouncementDTO>;
type StudentPage = Paged<AnnouncementDTO>;

const create = async (
  actor: "elena" | "oleg",
  body: AnnouncementCreateBody,
): Promise<{ status: number; body: StaffAnnouncementDTO | ApiErrorBody }> => {
  const res = await apiAs(actor).post<StaffAnnouncementDTO>("/api/staff/announcements", body, {
    headers: { "idempotency-key": randomUUID() },
  });
  return { status: res.status, body: res.body as StaffAnnouncementDTO | ApiErrorBody };
};

// ── Создание сотрудником ────────────────────────────────────────────────────

describe("POST /api/staff/announcements (студенческий офис, общевузовское подразделение)", () => {
  it("создаёт объявление: 201 StaffAnnouncementDTO, автор — Елена", async () => {
    const res = await create("elena", {
      title: "Объявление для группы Б-ЭК-101",
      bodyMd: "Текст **объявления** (Markdown, не HTML).\n",
      audience: { groupIds: [annaGroupId] },
      important: false,
    });
    expect(res.status).toBe(201);
    const dto = res.body as StaffAnnouncementDTO;
    expect(dto).toEqual({
      id: dto.id,
      title: "Объявление для группы Б-ЭК-101",
      bodyMd: "Текст **объявления** (Markdown, не HTML).",
      important: false,
      publishedAt: NOW,
      expiresAt: null,
      audience: { groupIds: [annaGroupId] },
      publishAt: NOW,
      archivedAt: null,
      author: "Елена М.",
    });
  });

  it("важное объявление: студентам аудитории — urgent-уведомление, остальным — ничего", async () => {
    const res = await create("elena", {
      title: "Важное объявление для группы Б-ЭК-101",
      bodyMd: "Текст важного объявления.",
      audience: { groupIds: [annaGroupId] },
      important: true,
    });
    expect(res.status).toBe(201);
    const id = (res.body as StaffAnnouncementDTO).id;

    const db = getDb();
    const rows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.category, "announcement"), eq(notifications.linkId, id)));
    const anna = rows.filter((n) => n.userId === fx.users.anna);
    expect(anna).toHaveLength(1);
    expect(anna[0].class).toBe("urgent");
    expect(anna[0].readAt).toBeNull();
    // Максим не в аудитории — уведомления нет.
    expect(rows.filter((n) => n.userId === fx.users.maxim)).toHaveLength(0);
  });

  it("обычное объявление: уведомление класса info", async () => {
    const res = await create("elena", {
      title: "Обычное объявление",
      bodyMd: "Текст обычного объявления.",
      audience: { facultyIds: [econFacultyId] },
      important: false,
    });
    const id = (res.body as StaffAnnouncementDTO).id;
    const [note] = await getDb()
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.category, "announcement"),
          eq(notifications.linkId, id),
          eq(notifications.userId, fx.users.anna),
        ),
      );
    expect(note?.class).toBe("info");
  });

  it("не указали Idempotency-Key → 422", async () => {
    const res = await apiAs("elena").post<ApiErrorBody>("/api/staff/announcements", {
      title: "Объявление",
      bodyMd: "Текст",
      audience: { groupIds: [annaGroupId] },
      important: false,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION");
    expect(res.body.error.details).toEqual({ reason: "IDEMPOTENCY_KEY_REQUIRED" });
  });

  it("без аудитории и с пустой аудиторией → 422 VALIDATION (path audience)", async () => {
    for (const audience of [{}, undefined]) {
      const body = {
        title: "Объявление",
        bodyMd: "Текст",
        important: false,
        ...(audience === undefined ? {} : { audience }),
      } as AnnouncementCreateBody;
      const res = await create("elena", body);
      expect(res.status, JSON.stringify(audience)).toBe(422);
      const error = (res.body as ApiErrorBody).error;
      const paths = (error.details as { issues: Array<{ path: string }> }).issues.map(
        (i) => i.path,
      );
      expect(paths).toContain("audience");
    }
  });

  it("ограничения полей: title > 120, bodyMd > 5000, пустой title → 422", async () => {
    const audience = { groupIds: [annaGroupId] };
    const cases: AnnouncementCreateBody[] = [
      { title: "х".repeat(121), bodyMd: "Текст", audience, important: false },
      { title: "Объявление", bodyMd: "х".repeat(5001), audience, important: false },
      { title: "   ", bodyMd: "Текст", audience, important: false },
    ];
    for (const body of cases) {
      const res = await create("elena", body);
      expect(res.status, JSON.stringify(body.title)).toBe(422);
      expect((res.body as ApiErrorBody).error.code).toBe("VALIDATION");
    }
  });
});

describe("модель области видимости аудитории (oleg — деканат факультета международных отношений)", () => {
  it("факультет другого сотрудника → 422 AUDIENCE_OUT_OF_FACULTY", async () => {
    const res = await create("oleg", {
      title: "Объявление для чужого факультета",
      bodyMd: "Текст",
      audience: { facultyIds: [econFacultyId] },
      important: false,
    });
    expect(res.status).toBe(422);
    expect((res.body as ApiErrorBody).error.details).toEqual({
      reason: "AUDIENCE_OUT_OF_FACULTY",
    });
  });

  it("группа чужого факультета → 422", async () => {
    const res = await create("oleg", {
      title: "Объявление для чужой группы",
      bodyMd: "Текст",
      audience: { groupIds: [annaGroupId] },
      important: false,
    });
    expect(res.status).toBe(422);
    expect((res.body as ApiErrorBody).error.details).toEqual({
      reason: "AUDIENCE_OUT_OF_FACULTY",
    });
  });

  it("несуществующие факультеты/группы → 422 AUDIENCE_NOT_FOUND", async () => {
    for (const audience of [
      { facultyIds: ["0b7f2c1e-4d6a-4c8e-9f3b-2a1d5e6f7a8b"] },
      { groupIds: ["0b7f2c1e-4d6a-4c8e-9f3b-2a1d5e6f7a8b"] },
    ]) {
      const res = await create("oleg", {
        title: "Объявление",
        bodyMd: "Текст",
        audience,
        important: false,
      });
      expect(res.status).toBe(422);
      expect((res.body as ApiErrorBody).error.details).toEqual({ reason: "AUDIENCE_NOT_FOUND" });
    }
  });

  it("своё подразделение → 201; в списке oleg нет объявлений студенческого офиса", async () => {
    const other = await create("elena", {
      title: "Объявление от офиса",
      bodyMd: "Текст офиса",
      audience: { facultyIds: [econFacultyId] },
      important: false,
    });
    expect(other.status).toBe(201);

    const mine = await create("oleg", {
      title: "Объявление деканата МО",
      bodyMd: "Текст деканата",
      audience: { facultyIds: [intlFacultyId] },
      important: false,
    });
    expect(mine.status).toBe(201);

    const list = await apiAs("oleg").get<StaffPage>("/api/staff/announcements");
    expect(list.status).toBe(200);
    expect(list.body.items.some((a) => a.title === "Объявление деканата МО")).toBe(true);
    expect(list.text).not.toContain((other.body as StaffAnnouncementDTO).id);
  });
});

describe("GET /api/me/announcements", () => {
  // Подготовка: шесть объявлений с разными аудиториями и сроками. Все видимые создаются
  // сейчас (publishAt = now), будущие — через сутки.
  let toAnnaGroup = "";
  let toMaximGroup = "";
  let toAnnaFaculty = "";
  let toFirstCourses = "";
  let combined = "";
  let future = "";
  let expired = "";

  beforeAll(async () => {
    const add = async (title: string, audience: AnnouncementAudience): Promise<string> => {
      const res = await create("elena", {
        title,
        bodyMd: "Текст объявления.",
        audience,
        important: false,
      });
      expect(res.status, title).toBe(201);
      return (res.body as StaffAnnouncementDTO).id;
    };
    toAnnaGroup = await add("Группа Б-ЭК-101", { groupIds: [annaGroupId] });
    toMaximGroup = await add("Группа М-ЦМ-11", { groupIds: [maximGroupId] });
    toAnnaFaculty = await add("Факультет ЭК", { facultyIds: [econFacultyId] });
    toFirstCourses = await add("Первый курс всех факультетов", { courses: [1] });
    // Критерии пересекаются (DS-31, ревью Claude): «факультет ЭК ∧ 1 курс» — Аня, не Максим.
    combined = await add("Первый курс факультета ЭК", {
      facultyIds: [econFacultyId],
      courses: [1],
    });

    const futureRes = await apiAs("elena").post<StaffAnnouncementDTO>(
      "/api/staff/announcements",
      {
        title: "Ещё не опубликовано",
        bodyMd: "Текст будущего объявления.",
        audience: { groupIds: [annaGroupId] },
        important: false,
        publishAt: "2026-11-13T12:00:00+03:00",
      },
      { headers: { "idempotency-key": randomUUID() } },
    );
    expect(futureRes.status).toBe(201);
    future = futureRes.body.id;

    const expiredRes = await apiAs("elena").post<StaffAnnouncementDTO>(
      "/api/staff/announcements",
      {
        title: "Уже истекло",
        bodyMd: "Текст истёкшего объявления.",
        audience: { groupIds: [annaGroupId] },
        important: false,
        expiresAt: "2026-11-12T11:00:00+03:00",
      },
      { headers: { "idempotency-key": randomUUID() } },
    );
    expect(expiredRes.status).toBe(201);
    expired = expiredRes.body.id;
  });

  it("Аня видит свои и общие объявления, не видит чужих и невидимых", async () => {
    const res = await apiAs("anna").get<StudentPage>("/api/me/announcements");
    expect(res.status).toBe(200);
    // Лента не пустая даже до тестовых объявлений: сид (DS-40) кладёт объявления
    // аудитории «факультет ЭК».
    const ids = res.body.items.map((a) => a.id);
    for (const id of [toAnnaGroup, toAnnaFaculty, toFirstCourses, combined]) {
      expect(ids, id).toContain(id);
    }
    for (const id of [toMaximGroup, future, expired]) {
      expect(ids, `скрыто от Ани: ${id}`).not.toContain(id);
    }
    // Формат студенческого DTO — без служебных полей сотрудника.
    const visible = res.body.items.find((a) => a.id === toAnnaFaculty)!;
    expect(Object.keys(visible).sort()).toEqual([
      "bodyMd",
      "expiresAt",
      "id",
      "important",
      "publishedAt",
      "title",
    ]);
  });

  it("Максим видит только свою аудиторию (пересечение критериев)", async () => {
    const res = await apiAs("maxim").get<StudentPage>("/api/me/announcements");
    expect(res.status).toBe(200);
    const ids = res.body.items.map((a) => a.id);
    for (const id of [toMaximGroup, toFirstCourses]) {
      expect(ids, id).toContain(id);
    }
    for (const id of [toAnnaGroup, toAnnaFaculty, combined, future, expired]) {
      expect(ids, `скрыто от Максима: ${id}`).not.toContain(id);
    }
  });

  it("будущее publishAt: студенту не видно, сотруднику видно", async () => {
    const student = await apiAs("anna").get<StudentPage>("/api/me/announcements");
    expect(student.text).not.toContain(future);
    const staff = await apiAs("elena").get<StaffPage>("/api/staff/announcements");
    expect(staff.text).toContain(future);
  });

  it("истёкшее объявление: студенту не видно, сотруднику видно", async () => {
    const student = await apiAs("anna").get<StudentPage>("/api/me/announcements");
    expect(student.text).not.toContain(expired);
    const staff = await apiAs("elena").get<StaffPage>("/api/staff/announcements");
    expect(staff.text).toContain(expired);
  });

  it("невалидный cursor/limit → 422", async () => {
    const res = await apiAs("anna").get<ApiErrorBody>("/api/me/announcements?cursor=garbage");
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION");
  });
});

describe("POST /api/staff/announcements/:id/archive", () => {
  let target = "";
  beforeAll(async () => {
    const res = await create("elena", {
      title: "Объявление под архив",
      bodyMd: "Текст.",
      audience: { groupIds: [annaGroupId] },
      important: false,
    });
    expect(res.status).toBe(201);
    target = (res.body as StaffAnnouncementDTO).id;
  });

  it("архив: 200, expiresAt/archivedAt = now, студент перестаёт видеть", async () => {
    const res = await apiAs("elena").post<StaffAnnouncementDTO>(
      `/api/staff/announcements/${target}/archive`,
    );
    expect(res.status).toBe(200);
    expect(res.body.archivedAt).toBe(NOW);
    expect(res.body.expiresAt).toBe(NOW);

    const student = await apiAs("anna").get<StudentPage>("/api/me/announcements");
    expect(student.text).not.toContain(target);
    const staff = await apiAs("elena").get<StaffPage>("/api/staff/announcements");
    expect(staff.text).toContain(target);
  });

  it("повторный архив → 409 CONFLICT", async () => {
    const res = await apiAs("elena").post<ApiErrorBody>(
      `/api/staff/announcements/${target}/archive`,
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("чужой факультет и несуществующий/«кривой» id → 404", async () => {
    for (const [actor, id] of [
      ["oleg", target],
      ["elena", "0b7f2c1e-4d6a-4c8e-9f3b-2a1d5e6f7a8b"],
      ["elena", "not-a-uuid"],
    ] as const) {
      const res = await apiAs(actor).post<ApiErrorBody>(`/api/staff/announcements/${id}/archive`);
      expect(res.status, `${actor} ${id}`).toBe(404);
      expect(res.body).toEqual({ error: { code: "NOT_FOUND" } });
    }
  });
});

describe("роли и доступ", () => {
  it("гость → 401 на оба маршрута", async () => {
    expect((await apiAs("guest").get("/api/staff/announcements")).status).toBe(401);
    expect((await apiAs("guest").get("/api/me/announcements")).status).toBe(401);
  });

  it("студенты получают 403 FORBIDDEN на /api/staff/*", async () => {
    const get = await apiAs("anna").get<ApiErrorBody>("/api/staff/announcements");
    expect(get.status).toBe(403);
    expect(get.body).toEqual({ error: { code: "FORBIDDEN" } });

    const post = await apiAs("maxim").post<ApiErrorBody>("/api/staff/announcements", {
      title: "Объявление",
      bodyMd: "Текст",
      audience: { groupIds: [maximGroupId] },
      important: false,
    });
    expect(post.status).toBe(403);
    expect(post.body).toEqual({ error: { code: "FORBIDDEN" } });
  });

  it("сотрудник получает 403 на /api/me/*", async () => {
    const res = await apiAs("elena").get<ApiErrorBody>("/api/me/announcements");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: "FORBIDDEN" } });
  });
});
