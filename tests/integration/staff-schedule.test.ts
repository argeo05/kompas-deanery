import { beforeAll, describe, expect, it } from "vitest";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import type {
  ApiErrorBody,
  ScheduleChangeDTO,
  StaffClassDTO,
  StaffClassesDTO,
} from "@/contracts/api";
import {
  auditLog,
  classes,
  notifications,
  rooms,
  scheduleChanges,
  studentProfiles,
  teachers,
} from "@db/schema";
import { toMsk } from "@/lib/time";
import { getDb } from "@/server/db";
import { apiAs, freezeTime, resetDb, type Actor } from "../helpers/api";
import type { Fixtures } from "../helpers/fixtures";

// Тесты расписания сотрудника (DS-32). Время заморожено до сида — даты детерминированы.
// Сид: группа Ани Б-ЭК-101 (экономфак) в четверг 2026-11-12 — 3 пары (макро 12:40 уже
// перенесена демо-сидом на 15:20); у Максима (М-ЦМ-11, медиафак) в пятницу 13.11 — одна
// пара в 19:00. Елена — студенческий офис (facultyId null, видит все факультеты),
// Олег — деканат МО (чужой для пар Ани → 404).

const NOW = "2026-11-12T12:00:00+03:00"; // четверг
const DAY = "2026-11-12";
const NEXT_DAY = "2026-11-13";
const FUTURE_DAY = "2026-11-16"; // понедельник
const MSK = "+03:00";

const db = () => getDb();

/** Пары группы в московском дне [from, to). */
async function classesOf(groupId: string, from: string, to: string) {
  return db()
    .select({ row: classes, room: rooms, teacher: teachers })
    .from(classes)
    .innerJoin(rooms, eq(rooms.id, classes.roomId))
    .innerJoin(teachers, eq(teachers.id, classes.teacherId))
    .where(
      and(
        eq(classes.groupId, groupId),
        gte(classes.startsAt, new Date(`${from}T00:00:00${MSK}`)),
        lt(classes.startsAt, new Date(`${to}T00:00:00${MSK}`)),
      ),
    )
    .orderBy(asc(classes.startsAt), asc(classes.id));
}

async function groupIdOf(userId: string): Promise<string> {
  const [row] = await db()
    .select({ groupId: studentProfiles.groupId })
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId));
  if (!row) throw new Error(`fixtures: нет профиля у ${userId}`);
  return row.groupId;
}

/** Уведомления категории schedule, адресованные пользователю по конкретной паре. */
function scheduleNotificationsFor(userId: string, classId: string) {
  return db()
    .select({ class: notifications.class, title: notifications.title, body: notifications.body })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.category, "schedule"),
        eq(notifications.linkId, classId),
      ),
    );
}

const IDEM = () => ({ "idempotency-key": `idem-${Math.random().toString(36).slice(2)}` });
const postChange = <T>(actor: Actor, classId: string, body: unknown) =>
  apiAs(actor).post<T>(`/api/staff/classes/${classId}/changes`, body, { headers: IDEM() });

let fx: Fixtures;
let annaGroup = "";
let maximGroup = "";
let annaDayClasses: Awaited<ReturnType<typeof classesOf>> = [];
let englishTodayId = "";
let annaFutureClass: Awaited<ReturnType<typeof classesOf>>[number];
let maximTomorrow: Awaited<ReturnType<typeof classesOf>>[number];
let annaStreamClassId = "";
let petrovId = "";

beforeAll(async () => {
  freezeTime(NOW);
  fx = await resetDb();

  annaGroup = await groupIdOf(fx.users.anna);
  maximGroup = await groupIdOf(fx.users.maxim);

  // Четверг Ани: микро 09:30, англ. 11:10, макро 12:40 (перенос на 15:20 из демо-сида).
  annaDayClasses = await classesOf(annaGroup, DAY, NEXT_DAY);
  expect(annaDayClasses).toHaveLength(3);
  englishTodayId = annaDayClasses[1]!.row.id;

  const annaFuture = await classesOf(annaGroup, FUTURE_DAY, "2026-11-17");
  expect(annaFuture.length).toBeGreaterThan(0);
  annaFutureClass = annaFuture[0]!;

  const maximTomorrowRows = await classesOf(maximGroup, NEXT_DAY, "2026-11-14");
  expect(maximTomorrowRows.length).toBeGreaterThan(0);
  maximTomorrow = maximTomorrowRows[0]!;

  const [petrov] = await db()
    .select({ id: teachers.id })
    .from(teachers)
    .where(eq(teachers.fullName, "Петров Андрей Викторович"));
  petrovId = petrov!.id;

  // Потоковая пара (group_id null) курса Ани на послезавтра: проверка получателей notify
  // через audience.courses — записанные на курс, а не вся группа. Максим на курсы Ани не записан.
  const [annaCourse] = await db()
    .select({ courseId: classes.courseId })
    .from(classes)
    .innerJoin(
      studentProfiles,
      and(eq(studentProfiles.userId, fx.users.anna), eq(studentProfiles.groupId, annaGroup)),
    )
    .where(eq(classes.groupId, annaGroup))
    .limit(1);
  const [streamRow] = await db()
    .insert(classes)
    .values({
      courseId: annaCourse!.courseId,
      groupId: null,
      type: "lecture",
      startsAt: new Date("2026-11-14T10:00:00+03:00"),
      endsAt: new Date("2026-11-14T11:20:00+03:00"),
      roomId: annaDayClasses[0]!.row.roomId,
      teacherId: petrovId,
    })
    .returning({ id: classes.id });
  annaStreamClassId = streamRow!.id;
});

describe("GET /api/staff/classes", () => {
  it("Елена (студенческий офис) видит пары дня всех групп; формат совпадает с чтением студента", async () => {
    const res = await apiAs("elena").get<StaffClassesDTO>(`/api/staff/classes?date=${DAY}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.body.items).toEqual(
      expect.arrayContaining(annaDayClasses.map((c) => expect.objectContaining({ id: c.row.id }))),
    );

    const micro = res.body.items.find((c) => c.id === annaDayClasses[0]!.row.id) as StaffClassDTO;
    expect(micro).toEqual({
      id: expect.any(String),
      course: {
        id: expect.any(String),
        title: "Микроэкономика",
        shortTitle: "Микро",
        colorIndex: 2,
      },
      type: "lecture",
      startsAt: `2026-11-12T09:30:00${MSK}`,
      endsAt: `2026-11-12T10:50:00${MSK}`,
      room: { ...annaDayClasses[0]!.room, id: expect.any(String) },
      teacher: {
        id: expect.any(String),
        fullName: "Кравцова Ирина Олеговна",
        email: "kravtsova.i@example.edu",
        officeHours: "Ср 15:00–16:30, ауд. 214",
      },
      weekParity: null,
      change: null,
      group: { id: annaGroup, title: "Б-ЭК-101" },
    });
  });

  it("применённое изменение: макро показана на новом месте, change.type=moved", async () => {
    const res = await apiAs("elena").get<StaffClassesDTO>(`/api/staff/classes?date=${DAY}`);
    const macro = res.body.items.find((c) => c.id === annaDayClasses[2]!.row.id) as StaffClassDTO;
    expect([macro.startsAt, macro.endsAt]).toEqual([
      `2026-11-12T15:20:00${MSK}`,
      `2026-11-12T16:40:00${MSK}`,
    ]);
    expect(macro.change).toMatchObject({ type: "moved", seen: false });
    expect(res.body.items.every((c) => c.startsAt.startsWith(DAY))).toBe(true);
  });

  it("дата обязательна и валидна: без date и кривые значения → 422", async () => {
    for (const q of ["", "groupId=" + annaGroup, "date=2026-13-40", `date=${DAY}&groupId=x`]) {
      const res = await apiAs("elena").get<ApiErrorBody>(`/api/staff/classes${q ? `?${q}` : ""}`);
      expect(res.status, q).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION");
    }
  });

  it("фильтр groupId: ровно пары группы Ани, отсортированы по времени", async () => {
    const res = await apiAs("elena").get<StaffClassesDTO>(
      `/api/staff/classes?date=${DAY}&groupId=${annaGroup}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items.map((c) => c.id).sort()).toEqual(
      annaDayClasses.map((c) => c.row.id).sort(),
    );
    const times = res.body.items.map((c) => c.startsAt);
    expect([...times].sort()).toEqual(times);
  });

  it("права: студент → 403, гость → 401", async () => {
    expect((await apiAs("anna").get(`/api/staff/classes?date=${DAY}`)).status).toBe(403);
    expect((await apiAs("guest").get(`/api/staff/classes?date=${DAY}`)).status).toBe(401);
  });

  it("Олег (деканат МО) не видит пары экономфака за тот же день", async () => {
    const res = await apiAs("oleg").get<StaffClassesDTO>(`/api/staff/classes?date=${DAY}`);
    expect(res.status).toBe(200);
    const visible = new Set(res.body.items.map((c) => c.id));
    expect(annaDayClasses.every((c) => !visible.has(c.row.id))).toBe(true);
  });
});

describe("POST /api/staff/classes/:id/changes", () => {
  it("права: студент → 403, гость → 401", async () => {
    expect((await postChange("anna", englishTodayId, { type: "cancelled" })).status).toBe(403);
    expect((await postChange("guest", englishTodayId, { type: "cancelled" })).status).toBe(401);
  });

  it("чужая пара для Олега → тот же 404, что несуществующий или кривой id", async () => {
    expect((await postChange("oleg", englishTodayId, { type: "cancelled" })).status).toBe(404);
    for (const id of ["not-a-uuid", "0b7f2c1e-4d6a-4c8e-9f3b-2a1d5e6f7a8b"]) {
      const res = await postChange<ApiErrorBody>("elena", id, { type: "cancelled" });
      expect(res.status, id).toBe(404);
      expect(res.body).toEqual({ error: { code: "NOT_FOUND" } });
    }
  });

  it("cancel завтрашней пары Максима: 201, DTO в формате чтения, уведомление urgent группе", async () => {
    const res = await postChange<ScheduleChangeDTO>("elena", maximTomorrow.row.id, {
      type: "cancelled",
      reason: "Преподаватель болеет",
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      type: "cancelled",
      previous: {
        startsAt: toMsk(maximTomorrow.row.startsAt),
        endsAt: toMsk(maximTomorrow.row.endsAt),
        roomNumber: maximTomorrow.room.number,
      },
      reason: "Преподаватель болеет",
      createdAt: expect.any(String),
      seen: false,
    });

    const rows = await scheduleNotificationsFor(fx.users.maxim, maximTomorrow.row.id);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.class).toBe("urgent");
    expect(rows[0]!.title).toBe("Пара отменена");
  });

  it("повторное изменение той же пары не запрещено схемой (unique(class_id) нет): 201 и вторая запись", async () => {
    const res = await postChange("elena", maximTomorrow.row.id, { type: "cancelled" });
    expect(res.status).toBe(201);
    const rows = await db()
      .select({ id: scheduleChanges.id })
      .from(scheduleChanges)
      .where(eq(scheduleChanges.classId, maximTomorrow.row.id));
    expect(rows).toHaveLength(2);
  });

  it("дебаунс: ещё один change по той же паре не создаёт второе уведомление", async () => {
    const before = await scheduleNotificationsFor(fx.users.maxim, maximTomorrow.row.id);
    expect(
      (
        await postChange("elena", maximTomorrow.row.id, {
          type: "cancelled",
          reason: "Снова болеет",
        })
      ).status,
    ).toBe(201);
    const after = await scheduleNotificationsFor(fx.users.maxim, maximTomorrow.row.id);
    expect(after).toHaveLength(before.length);
  });

  it("moved сегодняшней пары → 201 и urgent; уведомление о переносе", async () => {
    const res = await postChange<ScheduleChangeDTO>("elena", englishTodayId, {
      type: "moved",
      newStartsAt: `${DAY}T15:20:00${MSK}`,
      newEndsAt: `${DAY}T16:40:00${MSK}`,
    });
    expect(res.status).toBe(201);
    expect(res.body.previous?.roomNumber).toBe(annaDayClasses[1]!.room.number);

    const rows = await scheduleNotificationsFor(fx.users.anna, englishTodayId);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.class).toBe("urgent");
    expect(rows[0]!.body).toContain("перенос");
  });

  it("moved завтрашней пары → также urgent (пара сегодня или завтра); дебаунс держит одну строку", async () => {
    const res = await postChange<ScheduleChangeDTO>("elena", maximTomorrow.row.id, {
      type: "moved",
      newStartsAt: `${NEXT_DAY}T22:00:00${MSK}`,
      newEndsAt: `${NEXT_DAY}T23:20:00${MSK}`,
    });
    expect(res.status).toBe(201);
    const rows = await scheduleNotificationsFor(fx.users.maxim, maximTomorrow.row.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.class).toBe("urgent");
  });

  it("moved на будущую дату (+4 дня) → personal", async () => {
    const res = await postChange<ScheduleChangeDTO>("elena", annaFutureClass.row.id, {
      type: "moved",
      newStartsAt: `${FUTURE_DAY}T14:00:00${MSK}`,
      newEndsAt: `${FUTURE_DAY}T15:20:00${MSK}`,
    });
    expect(res.status).toBe(201);
    const rows = await scheduleNotificationsFor(fx.users.anna, annaFutureClass.row.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.class).toBe("personal");
  });

  it("room_changed → 201; несуществующая аудитория → 422", async () => {
    const res = await postChange<ScheduleChangeDTO>("elena", annaFutureClass.row.id, {
      type: "room_changed",
      newRoomId: annaDayClasses[0]!.row.roomId,
      reason: "Аудитория закрыта на ремонт",
    });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("room_changed");

    const bad = await postChange("elena", annaFutureClass.row.id, {
      type: "room_changed",
      newRoomId: "0b7f2c1e-4d6a-4c8e-9f3b-2a1d5e6f7a8b",
    });
    expect(bad.status).toBe(422);
  });

  it("teacher_changed → 201 (класс персональный по шаблону); несуществующий преподаватель → 422", async () => {
    const res = await postChange<ScheduleChangeDTO>("elena", annaFutureClass.row.id, {
      type: "teacher_changed",
      newTeacherId: petrovId,
    });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("teacher_changed");
    const rows = await scheduleNotificationsFor(fx.users.anna, annaFutureClass.row.id);
    expect(rows[0]!.class).toBe("personal");

    const bad = await postChange("elena", annaFutureClass.row.id, {
      type: "teacher_changed",
      newTeacherId: "0b7f2c1e-4d6a-4c8e-9f3b-2a1d5e6f7a8b",
    });
    expect(bad.status).toBe(422);
  });

  it("потоковая пара (group_id null): уведомление идёт записанным на курс, а не группе", async () => {
    const res = await postChange<ScheduleChangeDTO>("elena", annaStreamClassId, {
      type: "cancelled",
    });
    expect(res.status).toBe(201);
    const annaRows = await scheduleNotificationsFor(fx.users.anna, annaStreamClassId);
    expect(annaRows.length).toBeGreaterThanOrEqual(1);
    const maximRows = await scheduleNotificationsFor(fx.users.maxim, annaStreamClassId);
    expect(maximRows).toEqual([]);
  });

  it("валидация по типу: неполный moved/room_changed/teacher_changed и перенос назад → 422", async () => {
    for (const body of [
      { type: "moved" },
      { type: "moved", newStartsAt: `${NEXT_DAY}T15:20:00${MSK}` },
      {
        type: "moved",
        newStartsAt: `${NEXT_DAY}T15:20:00${MSK}`,
        newEndsAt: `${NEXT_DAY}T14:00:00${MSK}`,
      },
      { type: "room_changed" },
      { type: "teacher_changed" },
    ] as const) {
      const res = await postChange("elena", englishTodayId, body);
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
  });

  it("reason длиннее 200 символов → 422", async () => {
    const res = await postChange("elena", englishTodayId, {
      type: "cancelled",
      reason: "х".repeat(201),
    });
    expect(res.status).toBe(422);
  });

  it("audit_log: schedule.change записан от имени Елены", async () => {
    const [row] = await db()
      .select({ actorId: auditLog.actorId })
      .from(auditLog)
      .where(eq(auditLog.action, "schedule.change"))
      .orderBy(asc(auditLog.at))
      .limit(1);
    expect(row?.actorId).toBe(fx.users.elena);
  });
});
