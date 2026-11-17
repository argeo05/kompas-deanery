import "server-only";
import { and, desc, eq, gt } from "drizzle-orm";
import { sessions } from "../../../db/schema";
import { getDb } from "../db";

// Сеансы пользователя (SPEC §6.11 п.5). Читаются соединением владельца (RLS на sessions нет:
// ими пользуется Better Auth), поэтому условие по владельцу userId — в каждом запросе. userId только из сессии.
// Токен и его хеш наружу не отдаём.

export interface SessionRow {
  id: string;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function listUserSessions(userId: string, now: Date): Promise<SessionRow[]> {
  return getDb()
    .select({
      id: sessions.id,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, now)))
    .orderBy(desc(sessions.updatedAt))
    .limit(50);
}

/** true — сеанс принадлежал пользователю и удалён. Чужой или несуществующий — false (→ 404). */
export async function deleteUserSession(userId: string, sessionId: string): Promise<boolean> {
  const rows = await getDb()
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.id, sessionId)))
    .returning({ id: sessions.id });
  return rows.length > 0;
}

export async function deleteUserSessions(userId: string): Promise<number> {
  const rows = await getDb()
    .delete(sessions)
    .where(eq(sessions.userId, userId))
    .returning({ id: sessions.id });
  return rows.length;
}
