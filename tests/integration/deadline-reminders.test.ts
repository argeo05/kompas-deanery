import { beforeEach, describe, expect, it } from "vitest";
import { deadlines, notifications, plans } from "@db/schema";
import type {
  DeadlineDTO,
  DeadlinesDTO,
  NotificationPrefsDTO,
  NotificationsDTO,
  PlanDTO,
} from "@/contracts/api";
import { withUserTx } from "@/server/db";
import { apiAs, freezeTime, resetDb } from "../helpers/api";

const msk = (day: number, time: string) => `2026-11-${day}T${time}:00+03:00`;
const anna = apiAs("anna");
const prefs: NotificationPrefsDTO = {
  slots: [480, 780, 1140],
  preset: "default",
  quietFrom: 1380,
  quietTo: 420,
  immediateCategories: [],
  disabledCategories: [],
};
let userId: string;

beforeEach(async () => {
  freezeTime(msk(18, "10:00"));
  userId = (await resetDb()).users.anna;
});

async function newDeadline(title: string, dueAt = msk(20, "10:00")) {
  const result = await anna.post<DeadlineDTO>("/api/me/deadlines", { title, dueAt });
  expect(result.status).toBe(201);
  return result.body.id;
}

async function newPlan(deadlineId: string, startsAt: string, endsAt: string) {
  const result = await anna.post<PlanDTO>("/api/me/plans", {
    deadlineId,
    startsAt,
    endsAt,
    place: "Библиотека",
    firstAction: "Открою черновик",
  });
  expect(result.status).toBe(201);
  return result.body;
}

async function feed(id: string, category: "plan" | "deadline") {
  const result = await anna.get<NotificationsDTO>("/api/me/notifications?limit=50");
  expect(result.status).toBe(200);
  return result.body.items.filter((item) => item.category === category && item.link.id === id);
}

async function settings(overrides: Partial<NotificationPrefsDTO>) {
  expect((await anna.put("/api/me/notification-prefs", { ...prefs, ...overrides })).status).toBe(
    200,
  );
}

describe("Напоминания по планам и срокам", () => {
  it("завтрашний план приходит один раз в выбранную минуту, чтение заранее его не скрывает", async () => {
    const id = await newDeadline("Доклад");
    const start = msk(19, "10:00");
    const [plan, retry] = await Promise.all([
      newPlan(id, start, msk(19, "11:00")),
      newPlan(id, start, msk(19, "11:00")),
    ]);
    expect(retry.id).toBe(plan.id);
    freezeTime(msk(18, "13:00"));
    expect(await feed(id, "plan")).toEqual([]);
    expect((await anna.post("/api/me/notifications/read", { all: true })).status).toBe(204);
    expect((await anna.post("/api/me/notifications/read", { ids: [plan.id] })).status).toBe(204);
    freezeTime("2026-11-19T09:59:59+03:00");
    expect(await feed(id, "plan")).toEqual([]);
    freezeTime(start);
    const [first, second] = await Promise.all([feed(id, "plan"), feed(id, "plan")]);
    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
    expect(first[0]).toMatchObject({
      deliverAt: start,
      readAt: null,
      class: "personal",
      link: { kind: "deadline", id },
      body: expect.stringContaining("Открою черновик"),
    });
    expect((await anna.post("/api/me/notifications/read", { ids: [first[0]!.id] })).status).toBe(
      204,
    );
    await settings({ disabledCategories: ["plan"] });
    expect(await feed(id, "plan")).toEqual([{ ...first[0], readAt: start }]);
    const other = await apiAs("maxim").get<NotificationsDTO>("/api/me/notifications");
    expect(other.body.items.some((n) => n.link.id === id)).toBe(false);
  });

  it("перенос, удаление устаревшей версии и отмена текущей не возвращают старый интервал", async () => {
    const id = await newDeadline("График");
    const old = await newPlan(id, msk(18, "14:00"), msk(18, "15:00"));
    const middle = await newPlan(id, msk(18, "16:00"), msk(18, "17:00"));
    const current = await newPlan(id, msk(19, "10:00"), msk(19, "11:00"));
    expect((await anna.delete(`/api/me/plans/${old.id}`)).status).toBe(204);
    const before = await anna.get<DeadlinesDTO>("/api/me/deadlines");
    expect(before.body.groups.hot.find((d) => d.id === id)?.plan?.id).toBe(current.id);
    expect((await anna.delete(`/api/me/plans/${current.id}`)).status).toBe(204);
    expect((await anna.delete(`/api/me/plans/${middle.id}`)).status).toBe(404);
    const after = await anna.get<DeadlinesDTO>("/api/me/deadlines");
    expect(after.body.groups.hot.find((d) => d.id === id)?.plan).toBeNull();
    for (const at of [msk(18, "14:00"), msk(18, "16:00"), msk(19, "10:00")]) {
      freezeTime(at);
      expect(await feed(id, "plan")).toEqual([]);
    }
  });

  it("повтор старого запроса после переноса или отмены не возвращает прежнее время", async () => {
    const id = await newDeadline("Повтор после обрыва");
    const payload = {
      deadlineId: id,
      startsAt: msk(18, "16:00"),
      endsAt: msk(18, "17:00"),
      place: "Дома",
      firstAction: "Открою файл",
    };
    const headers = { "idempotency-key": "plan-first-window" };
    const save = () => anna.post<PlanDTO>("/api/me/plans", payload, { headers });
    const first = await save();
    expect(first.status).toBe(201);
    const replacement = await newPlan(id, msk(19, "10:00"), msk(19, "11:00"));
    expect((await save()).body).toEqual(first.body);
    const afterRetry = await anna.get<DeadlinesDTO>("/api/me/deadlines");
    expect(afterRetry.body.groups.hot.find((d) => d.id === id)?.plan?.id).toBe(replacement.id);
    expect((await anna.delete(`/api/me/plans/${replacement.id}`)).status).toBe(204);
    expect((await save()).body).toEqual(first.body);
    freezeTime(msk(19, "10:00"));
    expect(await feed(id, "plan")).toEqual([]);
  });

  it("учитывает границы тихих часов и отменённый дедлайн", async () => {
    const short = await newDeadline("Ночное окно");
    const long = await newDeadline("До завтрака");
    const done = await newDeadline("Уже готово");
    await newPlan(short, msk(18, "23:00"), msk(19, "07:00"));
    await newPlan(long, msk(19, "06:30"), msk(19, "07:30"));
    await newPlan(done, msk(19, "07:00"), msk(19, "08:00"));
    expect((await anna.post(`/api/me/deadlines/${done}/done`)).status).toBe(200);
    freezeTime("2026-11-19T06:59:59+03:00");
    expect(await feed(long, "plan")).toEqual([]);
    freezeTime(msk(19, "07:00"));
    expect(await feed(short, "plan")).toEqual([]);
    expect(await feed(done, "plan")).toEqual([]);
    expect(await feed(long, "plan")).toMatchObject([{ deliverAt: msk(19, "07:00") }]);
  });

  it("за сутки предупреждает в дайджест, пересчитывает будущий слот, учитывает готовность и отключение", async () => {
    const digest = await newDeadline("Эссе");
    const finished = await newDeadline("Уже сдано");
    const restored = await newDeadline("Верну к работе");
    await anna.post(`/api/me/deadlines/${finished}/done`);
    await anna.post(`/api/me/deadlines/${restored}/done`);
    await settings({ disabledCategories: ["deadline"] });
    freezeTime(msk(19, "10:00"));
    expect(await feed(digest, "deadline")).toEqual([]);
    await settings({});
    expect(await feed(digest, "deadline")).toEqual([]);
    freezeTime(msk(19, "13:00"));
    const reminder = await feed(digest, "deadline");
    expect(reminder).toMatchObject([
      { title: "Дедлайн завтра", createdAt: msk(19, "10:00"), deliverAt: msk(19, "13:00") },
    ]);
    expect(await feed(finished, "deadline")).toEqual([]);
    await anna.post(`/api/me/deadlines/${restored}/undone`);
    expect(await feed(restored, "deadline")).toHaveLength(1);
    await settings({ immediateCategories: ["deadline"] });
    expect(await feed(digest, "deadline")).toEqual(reminder);
    const immediate = await newDeadline("Срок через час", msk(19, "14:00"));
    expect(await feed(immediate, "deadline")).toMatchObject([
      { title: "Дедлайн сегодня", deliverAt: msk(19, "13:00") },
    ]);
  });

  it("восстанавливает старый план и срок из данных, не повторяя преждевременное старое сообщение", async () => {
    const created = new Date(msk(17, "10:00"));
    const id = await withUserTx(userId, async (tx) => {
      const [deadline] = await tx
        .insert(deadlines)
        .values({
          studentId: userId,
          source: "assessment",
          title: "Задание до обновления",
          dueAt: new Date(msk(20, "10:00")),
          createdAt: created,
        })
        .returning();
      await tx.insert(plans).values({
        studentId: userId,
        deadlineId: deadline.id,
        startsAt: new Date(msk(19, "10:00")),
        endsAt: new Date(msk(19, "11:00")),
        place: "Дома",
        firstAction: "Открою тетрадь",
        createdAt: created,
      });
      await tx.insert(notifications).values({
        userId,
        class: "personal",
        category: "plan",
        title: "Время для плана",
        body: "Прежний текст",
        linkKind: "deadline",
        linkId: deadline.id,
        createdAt: created,
        deliverAt: new Date(msk(17, "13:00")),
      });
      return deadline.id;
    });
    expect(await feed(id, "plan")).toEqual([]);
    freezeTime(msk(19, "13:00"));
    expect(await feed(id, "plan")).toMatchObject([{ deliverAt: msk(19, "10:00") }]);
    expect(await feed(id, "deadline")).toMatchObject([{ deliverAt: msk(19, "13:00") }]);
  });
});
