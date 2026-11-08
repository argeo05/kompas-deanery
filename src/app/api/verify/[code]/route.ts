import { RateLimiterMemory } from "rate-limiter-flexible";
import type { VerifyDTO } from "@/contracts/api";
import { getClientIp } from "@/server/auth/client-ip";
import { getDb } from "@/server/db";
import { fail, ok, route } from "@/server/http";
import { checkVerifyCode } from "@/server/services/documents";

// DS-23. Публичная проверка подлинности справки — без сессии (SPEC §6.5 п.9, §9.7).
// Найден не будет → 200 { found: false } (не различаем «нет» и «не тот», и не 404/422:
// формат кода не выдаём). В ответе нет ФИО, группы и номера заявки.
// Лимит — 30 запросов в минуту на IP (SPEC §9.7); IP — из заголовка нашего прокси.

const limiter = new RateLimiterMemory({ points: 30, duration: 60 });

/** GET /api/verify/:code → 200 VerifyDTO; перебор кодов — 429 RATE_LIMITED. */
export const GET = route<{ code: string }>(async (req, { params }) => {
  const ip = getClientIp(req.headers);
  try {
    await limiter.consume(ip);
  } catch {
    return fail(429, "RATE_LIMITED");
  }
  const { code } = await params;
  // Явно защитились от мусора большой длины; любые «несуществующие» коды — просто found: false.
  if (code.length === 0 || code.length > 256) return ok<VerifyDTO>({ found: false });
  const result = await getDb().transaction((tx) => checkVerifyCode(tx, code));
  return ok<VerifyDTO>(result);
});
