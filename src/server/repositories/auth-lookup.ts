import "server-only";
import { eq } from "drizzle-orm";
import { users } from "../../../db/schema";
import type { Db } from "../db";

// Справочный запрос для хука входа: демо-аккаунт ли этот логин (D-005, D-017).
// Возвращает только булево — ничего личного; несуществующий логин → false.
export async function isDemoLogin(db: Db, login: string): Promise<boolean> {
  const [row] = await db
    .select({ isDemo: users.isDemo })
    .from(users)
    .where(eq(users.username, login))
    .limit(1);
  return row?.isDemo === true;
}
