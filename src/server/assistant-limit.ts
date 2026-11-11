import "server-only";
import { RateLimiterMemory } from "rate-limiter-flexible";

// Лимит помощника (SPEC §6.8.2): 20 вопросов в сутки на пользователя. Ключ — userId из сессии.
export const ASSISTANT_DAILY_LIMIT = 20;
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
