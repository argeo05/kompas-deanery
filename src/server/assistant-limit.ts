import "server-only";
import { RateLimiterMemory } from "rate-limiter-flexible";

// Лимит помощника (SPEC §6.8.2): 20 вопросов в сутки на пользователя. Ключ — userId из сессии.
// AI_DAILY_LIMIT нужен только e2e-стенду: повторные прогоны не должны упираться в суточный лимит.
// В production переменная работает только на e2e-стенде (KOMPAS_DEV_UI): рабочий лимит поднять нельзя.
// Лимит хранится в памяти процесса и сбрасывается при перезапуске: ограничение одного инстанса (D-016).
const override =
  process.env.NODE_ENV !== "production" || process.env.KOMPAS_DEV_UI === "true"
    ? Number(process.env.AI_DAILY_LIMIT)
    : 0;
export const ASSISTANT_DAILY_LIMIT = override > 0 ? override : 20;
const limiter = new RateLimiterMemory({ points: ASSISTANT_DAILY_LIMIT, duration: 24 * 3600 });

/** Списывает вопрос. null — лимит исчерпан, иначе сколько вопросов осталось. */
export async function consumeAssistantQuestion(userId: string): Promise<number | null> {
  try {
    const res = await limiter.consume(userId);
    return res.remainingPoints;
  } catch {
    return null;
  }
}
