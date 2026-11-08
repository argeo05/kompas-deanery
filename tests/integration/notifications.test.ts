import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { notifications } from "../../db/schema/communication";
import { getDb, withUserTx } from "../../src/server/db";
import { notify } from "../../src/server/services/notify";
import { renderNotification } from "../../src/server/notify-templates";
import { apiAs, freezeTime, resetDb } from "../helpers/api";
import type { ApiErrorBody, NotificationPrefsDTO, NotificationsDTO } from "@/contracts/api";

// DS-18 · Уведомления: список/чтение/настройки + сервис notify (с黛玉 DS-02, дебаунс 2 мин).
// Время заморожено до сида («сегодня» = 2026-11-12, четверг, 12:00 МСК).

const NOW = "2026-11-12T12:00:00+03:00"; // четверг 12:00 МСК

const annaIdOut = "00000000-0000-0000-0000-000000000010"; // link.id для notify-теста

let annaId: string;
let maximId: string;

beforeAll(async () => {
  freezeTime(NOW);
  const fx = await resetDb();
  annaId = fx.users.anna;
  maximId = fx.users.maxim;
});

describe("GET /api/me/notifications", () => {
  it("отдаёт только доставленные (deliverAt ≤ now), демо-данные Ани: 2 непрочитанных", async () => {
    const res = await apiAs("anna").get<NotificationsDTO>("/api/me/notifications");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    // Демо-сценарий Ани: перенос пары (urgent), готовая справка (personal), прочитанная «в работе».
    expect(res.body.items).toHaveLength(3);
    expect(res.body.unread).toEqual({ urgent: 1, personal: 1, info: 0 });
    const read = res.body.items.filter((n) => n.readAt !== null);
    expect(read.map((n) => n.readAt)).toContain("2026-11-11T13:20:00+03:00"); // демо-«в работе»
    for (const n of res.body.items) {
      expect(n.link.kind).toBeDefined();
      expect(n.createdAt.startsWith("2026-11")).toBe(true);
    }
    expect(res.body.items.map((n) => n.category).sort()).toEqual([
      "request",
      "request",
      "schedule",
    ]);
  });

  it("вкладки фильтруют: important = urgent+personal, announcements — пусто в сиде", async () => {
    const important = await apiAs("anna").get<NotificationsDTO>(
      "/api/me/notifications?tab=important",
    );
    expect(important.body.items).toHaveLength(3);
    const announcements = await apiAs("anna").get<NotificationsDTO>(
      "/api/me/notifications?tab=announcements",
    );
    expect(announcements.body.items).toHaveLength(0);
  });

  it("курсорная пагинация проходит все 3 без повторов", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page++) {
      const res = await apiAs("anna").get<NotificationsDTO>(
        cursor ? `/api/me/notifications?limit=1&cursor=${cursor}` : "/api/me/notifications?limit=1",
      );
      if (res.body.items.length === 0) break;
      seen.push(...res.body.items.map((n) => n.id));
      cursor = res.body.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toHaveLength(3);
    expect(new Set(seen).size).toBe(3);
    expect(cursor).toBeNull();
  });

  it("Максим видит только свои уведомления, id Ани не утекают", async () => {
    const anna = await apiAs("anna").get<NotificationsDTO>("/api/me/notifications");
    const maxim = await apiAs("maxim").get<NotificationsDTO>("/api/me/notifications");
    expect(maxim.body.items.map((n) => n.id)).not.toContain(anna.body.items[0].id);
    expect(maxim.body.unread.urgent).toBe(1); // needs_info — urgent
  });

  it("гость — 401, сотрудник — 403", async () => {
    expect((await apiAs("guest").get("/api/me/notifications")).status).toBe(401);
    const staff = await apiAs("elena").get("/api/me/notifications");
    expect(staff.status).toBe(403);
  });
});

describe("POST /api/me/notifications/read", () => {
  it("{ ids } → 204; чтение только своих: чужой id не меняет данные Ани", async () => {
    const before = await apiAs("anna").get<NotificationsDTO>("/api/me/notifications");
    const firstId = before.body.items[0].id;

    expect(
      (await apiAs("anna").post("/api/me/notifications/read", { ids: [firstId] })).status,
    ).toBe(204);
    const after = await apiAs("anna").get<NotificationsDTO>("/api/me/notifications");
    expect(after.body.unread.urgent + after.body.unread.personal).toBe(1);

    // Максим пытается прочитать уведомление Ани — эффект нулевой (RLS-фильтр по пользователю).
    expect(
      (await apiAs("maxim").post("/api/me/notifications/read", { ids: [firstId] })).status,
    ).toBe(204);
    const still = await apiAs("anna").get<NotificationsDTO>("/api/me/notifications");
    expect(still.body.unread.urgent + still.body.unread.personal).toBe(1);
  });

  it("{ all: true } → 204, все непрочитанные становятся readAt", async () => {
    const res = await apiAs("anna").post("/api/me/notifications/read", { all: true });
    expect(res.status).toBe(204);
    const after = await apiAs("anna").get<NotificationsDTO>("/api/me/notifications");
    expect(after.body.unread).toEqual({ urgent: 0, personal: 0, info: 0 });
  });

  it("невалидное тело → 422 VALIDATION", async () => {
    const res = await apiAs("anna").post<ApiErrorBody>("/api/me/notifications/read", {});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION");
  });
});

describe("GET/PUT /api/me/notification-prefs", () => {
  it("дефолт настроек: слоты 8:00/13:00/19:00, quiet 23–07, ничего выключено", async () => {
    const res = await apiAs("anna").get<NotificationPrefsDTO>("/api/me/notification-prefs");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      slots: [480, 780, 1140],
      preset: "default",
      quietFrom: 1380,
      quietTo: 420,
      immediateCategories: [],
      disabledCategories: [],
    });
  });

  it("PUT сохраняет настройки и возвращает актуальные", async () => {
    const res = await apiAs("anna").put<NotificationPrefsDTO>("/api/me/notification-prefs", {
      slots: [540, 1260],
      preset: "custom",
      quietFrom: 1320,
      quietTo: 480,
      immediateCategories: ["grade"],
      disabledCategories: ["announcement"],
    });
    expect(res.status).toBe(200);
    expect(res.body.slots).toEqual([540, 1260]);

    const reload = await apiAs("anna").get<NotificationPrefsDTO>("/api/me/notification-prefs");
    expect(reload.body.slots).toEqual([540, 1260]);
    expect(reload.body.immediateCategories).toEqual(["grade"]);
    expect(reload.body.disabledCategories).toEqual(["announcement"]);
  });

  it("schedule выключить нельзя: ни в disabledCategories, ни в immediateCategories → 422", async () => {
    const off = await apiAs("anna").put<ApiErrorBody>("/api/me/notification-prefs", {
      slots: [540],
      preset: "custom",
      quietFrom: 1380,
      quietTo: 420,
      immediateCategories: [],
      disabledCategories: ["schedule"],
    });
    expect(off.status).toBe(422);
    expect(off.body.error.code).toBe("VALIDATION");

    const immediate = await apiAs("anna").put<ApiErrorBody>("/api/me/notification-prefs", {
      slots: [540],
      preset: "custom",
      quietFrom: 1380,
      quietTo: 420,
      immediateCategories: ["schedule"],
      disabledCategories: [],
    });
    expect(immediate.status).toBe(422);
  });

  it.each([
    { name: "пустые слоты", body: { slots: [], quietFrom: 1380, quietTo: 420 } },
    {
      name: "5 слотов",
      body: { slots: [480, 720, 960, 1200, 1300], quietFrom: 1380, quietTo: 420 },
    },
    { name: "не по возрастанию", body: { slots: [900, 480], quietFrom: 1380, quietTo: 420 } },
    { name: "вне дня", body: { slots: [1440], quietFrom: 1380, quietTo: 420 } },
  ])("валидация слотов: $name → 422", async ({ body }) => {
    const res = await apiAs("anna").put<ApiErrorBody>("/api/me/notification-prefs", body);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION");
  });

  it("гость — 401, сотрудник — 403 (GET и PUT)", async () => {
    expect((await apiAs("guest").get("/api/me/notification-prefs")).status).toBe(401);
    expect((await apiAs("elena").get("/api/me/notification-prefs")).status).toBe(403);
    const staff = await apiAs("elena").put("/api/me/notification-prefs", {
      slots: [540],
      quietFrom: 1380,
      quietTo: 420,
    });
    expect(staff.status).toBe(403);
  });
});

describe("сервис notify: слоты DS-02 и дебаунс", () => {
  const db = getDb();

  it("urgent при 12:00 — мгновенно (deliverAt = createdAt); personal — ближайший слот 21:00", async () => {
    // Аня уже настроила слоты [540,1260] (09:00, 21:00): в 12:00 ближайший слот — 21:00.
    const courseLinkId = annaIdOut;
    await withUserTx(annaId, async (tx) => {
      await notify(tx, {
        studentIds: [annaId],
        ...renderNotification("schedule_moved", {
          course: "Макроэкономика",
          from: NOW,
          to: NOW,
          room: "4012",
        }),
        class: "urgent",
        category: "schedule",
        link: { kind: "course", id: courseLinkId },
      });
      await notify(tx, {
        studentIds: [annaId],
        ...renderNotification("request_taken", {
          requestTitle: "Справка об обучении",
          number: "СП-2611-0001",
        }),
        class: "personal",
        category: "request",
        link: { kind: "request", id: "00000000-0000-0000-0000-000000000001" },
      });
    });
    const [urgentRow] = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, annaId),
          eq(notifications.category, "schedule"),
          eq(notifications.linkId, courseLinkId),
        ),
      )
      .limit(1);
    expect(urgentRow!.deliverAt.toISOString()).toBe(urgentRow!.createdAt.toISOString());

    const [personalRow] = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, annaId),
          eq(notifications.category, "request"),
          eq(notifications.linkKind, "request"),
          eq(notifications.title, "Заявка в работе"),
        ),
      )
      .limit(1);
    // created_at «сейчас» (12:00), deliverAt — 21:00 МСК того же дня.
    expect(personalRow!.createdAt.getUTCHours()).toBe(9); // 12:00+03 — 09:00 UTC
    expect(personalRow!.deliverAt.toISOString()).toContain("T18:00:00"); // 21:00 МСК = 18:00 UTC
  });

  it("дебаунс: 3 события по (category, linkId) → одна запись, текст последнего события", async () => {
    const link = { kind: "course", id: "00000000-0000-0000-0000-000000000002" } as const;
    await withUserTx(maximId, async (tx) => {
      for (let i = 1; i <= 3; i++) {
        await notify(tx, {
          studentIds: [maximId],
          ...renderNotification("grade_posted", {
            course: "Политология",
            item: `Контрольная ${i}`,
            score: 5,
            max: 10,
          }),
          class: "urgent",
          category: "grade",
          link,
        });
      }
    });
    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, maximId),
          eq(notifications.category, "grade"),
          eq(notifications.linkId, link.id),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Новая оценка"); // шаблон grade_posted
    expect(rows[0]!.body).toContain("Контрольная 3");
  });

  it("выключенная категория не создаёт уведомления (кроме urgent)", async () => {
    const link = { kind: "course", id: "00000000-0000-0000-0000-000000000003" } as const;
    // Аня отключила «announcement».
    await withUserTx(annaId, async (tx) => {
      await notify(tx, {
        studentIds: [annaId],
        class: "info",
        category: "announcement",
        title: "Объявление",
        body: "",
        link,
      });
      await notify(tx, {
        studentIds: [annaId],
        class: "urgent",
        category: "announcement",
        title: "Важное объявление",
        body: "д",
        link: { kind: "course", id: "00000000-0000-0000-0000-000000000004" },
      });
    });
    expect(
      await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, annaId),
            eq(notifications.category, "announcement"),
            eq(notifications.class, "info"),
          ),
        ),
    ).toHaveLength(0);
  });
});
