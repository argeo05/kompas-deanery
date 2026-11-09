import "server-only";
import { RateLimiterMemory } from "rate-limiter-flexible";

// Лимит публичной проверки подлинности (SPEC §9.7): 30 запросов в минуту на IP.
// Общий для API /api/verify/:code и страницы /verify/:code: иначе страницей можно перебирать коды без лимита.
const limiter = new RateLimiterMemory({ points: 30, duration: 60 });

/** true — запрос в пределах лимита. */
export async function consumeVerifyLimit(ip: string): Promise<boolean> {
  try {
    await limiter.consume(ip);
    return true;
  } catch {
    return false;
  }
}
