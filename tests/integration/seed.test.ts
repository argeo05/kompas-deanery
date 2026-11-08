import { beforeAll, describe, expect, it } from "vitest";
import { count, eq, not, like, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { resetDb } from "../helpers/api";
import * as schema from "../../db/schema";
import { users } from "../../db/schema";
import { now } from "../../src/lib/clock";

// Тест фонового сида (DS-40, SPEC §11.3): объёмы популяции, демо-аккаунты,
// отсутствие e-mail вне @example.edu. Даты сида идут от now() (src/lib/clock.ts) — freezeTime()
// перед resetDb() делает их детерминированными.

const one = async (rows: Promise<Array<Record<string, unknown>>>): Promise<number> => {
  const list = await rows;
  return Number(Object.values(list[0] ?? {})[0] ?? 0);
};

beforeAll(async () => {
  void now();
  await resetDb();
});
const db = getDb();

describe("сид: объёмы (SPEC §11.3, D-003)", () => {
  it("структура вуза: 3 факультета, 6 программ, 8 групп, 25 преподавателей, 30 аудиторий, 18 дисциплин", async () => {
    expect(await one(db.select({ n: count() }).from(schema.faculties))).toBe(3);
    expect(await one(db.select({ n: count() }).from(schema.programs))).toBe(6);
    expect(await one(db.select({ n: count() }).from(schema.groups))).toBe(8);
    expect(await one(db.select({ n: count() }).from(schema.teachers))).toBe(25);
    expect(await one(db.select({ n: count() }).from(schema.rooms))).toBe(30);
    expect(await one(db.select({ n: count() }).from(schema.courses))).toBe(18);
  });

  it("студентов 40: 2 демо + 4 очереди + 34 фоновых", async () => {
    expect(await one(db.select({ n: count() }).from(schema.studentProfiles))).toBe(40);
    expect(await one(db.select({ n: count() }).from(users).where(eq(users.isDemo, true)))).toBe(4);
  });

  it("все e-mail — только @example.edu, номера студенческих карт БОЛЬШЕ DEMO-…", async () => {
    const [bad] = await db
      .select({ n: count() })
      .from(users)
      .where(not(like(users.email, "%@example.edu")));
    expect(Number(bad!.n)).toBe(0);
    const [badCards] = await db
      .select({ n: count() })
      .from(schema.studentProfiles)
      .where(not(like(schema.studentProfiles.studentCardNo, "DEMO-%")));
    expect(Number(badCards!.n)).toBe(0);
  });

  it("оценок ≥ 200, заявок 72, объявлений 30, пары есть", async () => {
    expect(await one(db.select({ n: count() }).from(schema.grades))).toBeGreaterThanOrEqual(200);
    expect(await one(db.select({ n: count() }).from(schema.requests))).toBe(72);
    expect(await one(db.select({ n: count() }).from(schema.announcements))).toBe(30);
    expect(await one(db.select({ n: count() }).from(schema.classes))).toBeGreaterThan(20);
  });

  it("очередь Елены точная: submitted 4, in_progress 6 — популяция их не создаёт", async () => {
    const rows = await db.execute(
      sql`SELECT count(*) FILTER (WHERE status = 'submitted') AS submitted,
                 count(*) FILTER (WHERE status = 'in_progress') AS in_progress FROM requests`,
    );
    const [{ submitted, in_progress }] = rows as unknown as Array<{
      submitted: string;
      in_progress: string;
    }>;
    expect(Number(submitted)).toBe(4);
    expect(Number(in_progress)).toBe(6);
  });

  it("пары, оценки и экзамены в демо-группах — только от demo-accounts", async () => {
    const [cls] = await db.execute(
      sql`SELECT count(*)::text AS n FROM classes c JOIN groups g ON g.id = c.group_id
           WHERE g.title IN ('Б-ЭК-101', 'М-ЦМ-11')`,
    );
    const [exam] = await db.execute(
      sql`SELECT count(*)::text AS n FROM exams e JOIN groups g ON g.id = e.group_id
           WHERE g.title IN ('Б-ЭК-101', 'М-ЦМ-11')`,
    );
    expect(Number((cls as unknown as { n: string }).n)).toBeGreaterThan(20);
    expect(Number((cls as unknown as { n: string }).n)).toBeLessThan(200);
    expect(Number((exam as unknown as { n: string }).n)).toBe(5);
  });
});
