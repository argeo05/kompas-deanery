import { NextResponse } from "next/server";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { findUserIdByTokenHash, feedTokenHash } from "@/server/repositories/ics-tokens";
import { findStudentContext } from "@/server/repositories/session-context";
import { getDb, withUserTx } from "@/server/db";
import { fail, route } from "@/server/http";
import { buildIcsFeed } from "@/server/services/ics";

// DS-22. Единственный неаутентифицированный endpoint с личными данными (SPEC §6.9):
// токен 256 бит из URL, в БД только его SHA-256. В ответе — минимум полей: SUMMARY,
// LOCATION (корпус и аудитория), DESCRIPTION (преподаватель) — без лишнего.
// Лимит — 60 запросов в час на токен; состояние лимита в памяти процесса
// (перезапуск сбрасывает: осознанный компромисс, SPEC §9.7).
//
// Запросы без сессии, поэтому:
//   поиск владельца — соединением владельца (как /api/verify: роль kompas_app сюда не пускает);
//   пары и дедлайны — строго внутри withUserTx владельца (RLS + условие по владельцу в репозитории).

/** 60 запросов на токен против перебора и параноидальных клиентов-поллеров. */
const limiter = new RateLimiterMemory({ points: 60, duration: 3600 });
const MAX_TOKEN_LENGTH = 256;

/** GET /api/ics/:token[.ics] → text/calendar; неверный токен — 404, перебор — 429. */
export const GET = route<{ token: string }>(async (req, { params }) => {
  const { token: rawToken } = await params;
  try {
    await limiter.consume(rawToken);
  } catch {
    return fail(429, "RATE_LIMITED");
  }

  // Сегмент приходит с суффиксом .ics (форма /api/ics/<token>.ics); без него тоже понимаем.
  const token = rawToken.endsWith(".ics") ? rawToken.slice(0, -4) : rawToken;
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return fail(404, "NOT_FOUND");

  const ownerId = await getDb().transaction((tx) =>
    findUserIdByTokenHash(tx, feedTokenHash(token)),
  );
  if (!ownerId) return fail(404, "NOT_FOUND");
  const student = await findStudentContext(ownerId);
  if (!student?.groupId) return fail(404, "NOT_FOUND");

  const calendar = await withUserTx(ownerId, (tx) =>
    buildIcsFeed(tx, { studentId: ownerId, groupId: student.groupId }),
  );
  return new NextResponse(calendar, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
});
