import { asc, desc, eq, inArray } from "drizzle-orm";
import { requests, users } from "@db/schema";
import { DEMO_ACCOUNTS, type DemoLogin } from "@db/seed/demo-accounts";
import { getDb } from "@/server/db";

// Идентификаторы засеянных объектов для тестов. Читаются из БД после сида владельцем БД (без RLS).

export interface Fixtures {
  users: Record<DemoLogin, string>;
  /** Заявки студентов, новые первыми. */
  requests: { anna: string[]; maxim: string[] };
}

export async function loadFixtures(): Promise<Fixtures> {
  const db = getDb();
  const logins = Object.values(DEMO_ACCOUNTS).map((a) => a.login);
  const rows = await db
    .select({ id: users.id, login: users.username })
    .from(users)
    .where(inArray(users.username, logins));
  const byLogin = new Map(rows.map((r) => [r.login, r.id]));
  const ids = Object.fromEntries(
    Object.entries(DEMO_ACCOUNTS).map(([key, a]) => {
      const id = byLogin.get(a.login);
      if (!id) throw new Error(`fixtures: нет пользователя ${a.login}`);
      return [key, id];
    }),
  ) as Record<DemoLogin, string>;

  const requestsOf = async (studentId: string) =>
    (
      await db
        .select({ id: requests.id })
        .from(requests)
        .where(eq(requests.studentId, studentId))
        .orderBy(desc(requests.createdAt), asc(requests.id))
    ).map((r) => r.id);

  return {
    users: ids,
    requests: { anna: await requestsOf(ids.anna), maxim: await requestsOf(ids.maxim) },
  };
}
