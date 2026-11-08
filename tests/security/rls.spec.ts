import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { requests, studentProfiles } from "@db/schema";
import { getDb, withUserTx } from "@/server/db";
import { resetDb } from "../helpers/db";
import type { Fixtures } from "../helpers/fixtures";

// Третий уровень защиты (SPEC §9.3 п.3): даже запрос без условия по владельцу
// внутри withUserTx не отдаёт чужие строки.

const PERSONAL_TABLES = [
  "student_profiles",
  "enrollments",
  "class_notes",
  "schedule_change_views",
  "grades",
  "grade_history",
  "final_results",
  "admissions",
  "requests",
  "request_events",
  "request_messages",
  "documents",
  "notifications",
  "notification_prefs",
  "deadlines",
  "plans",
  "tickets",
  "ticket_messages",
  "ics_tokens",
  "idempotency_keys",
];

/** Drizzle оборачивает ошибку PostgreSQL; 42501 — insufficient_privilege. */
const PERMISSION_DENIED = { cause: { code: "42501" } };

let fx: Fixtures;
beforeAll(async () => {
  fx = await resetDb();
});

describe("RLS", () => {
  it("включена и имеет политики на каждой личной таблице", async () => {
    const rows = await getDb().execute<{ table: string; rls: boolean; policies: number }>(sql`
      SELECT c.relname AS table, c.relrowsecurity AS rls,
             (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'`);
    const byName = new Map(rows.map((r) => [r.table, r]));
    for (const table of PERSONAL_TABLES) {
      expect(byName.get(table), table).toMatchObject({ rls: true });
      expect(byName.get(table)!.policies, `${table}: нет политик`).toBeGreaterThan(0);
    }
  });

  it("студент без WHERE по владельцу видит только свои заявки", async () => {
    const rows = await withUserTx(fx.users.maxim, (tx) => tx.select().from(requests));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.studentId === fx.users.maxim)).toBe(true);
  });

  it("студент не видит чужой профиль и не может изменить чужую заявку", async () => {
    await withUserTx(fx.users.maxim, async (tx) => {
      const profiles = await tx.select().from(studentProfiles);
      expect(profiles.map((p) => p.userId)).toEqual([fx.users.maxim]);
      const updated = await tx
        .update(requests)
        .set({ status: "cancelled" })
        .where(sql`${requests.id} = ${fx.requests.anna[0]}`)
        .returning();
      expect(updated).toEqual([]);
    });
  });

  it("сотрудник другого факультета не видит заявки Ани", async () => {
    const rows = await withUserTx(fx.users.oleg, (tx) => tx.select().from(requests));
    expect(rows.some((r) => r.studentId === fx.users.anna)).toBe(false);
  });

  it("сотрудник не видит оценки (минимальные права, SPEC §5.1)", async () => {
    const own = await withUserTx(fx.users.anna, (tx) =>
      tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM grades`),
    );
    expect(own[0].n, "у Ани в сиде есть оценка").toBeGreaterThan(0);
    const rows = await withUserTx(fx.users.elena, (tx) =>
      tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM grades`),
    );
    expect(rows[0].n).toBe(0);
  });

  it("без app.user_id роль приложения не видит ничего", async () => {
    const rows = await getDb().transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE kompas_app`);
      return tx.select().from(requests);
    });
    expect(rows).toEqual([]);
  });

  it("история заявки только дописывается: UPDATE и DELETE запрещены", async () => {
    await expect(
      withUserTx(fx.users.elena, (tx) => tx.execute(sql`DELETE FROM request_events`)),
    ).rejects.toMatchObject(PERMISSION_DENIED);
    await expect(
      withUserTx(fx.users.elena, (tx) => tx.execute(sql`UPDATE audit_log SET action = 'x'`)),
    ).rejects.toMatchObject(PERMISSION_DENIED);
  });
});
