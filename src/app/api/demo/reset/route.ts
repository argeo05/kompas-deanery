import type { DemoResetDTO } from "@/contracts/api";
import { getClientIp } from "@/server/auth/client-ip";
import { HttpError, fail, ok, route } from "@/server/http";
import { resetDemoData } from "@/server/services/demo-reset";

// POST /api/demo/reset — «Сбросить демо-данные» (SPEC §6.12). Доступен гостю (так требует SPEC:
// эксперт может испортить данные до входа), поэтому: проверка Origin в route(), лимит раз в 5 минут,
// без параметров — сбрасывается всегда одно и то же. В отчёте о сбросе нет ничего личного.
export const POST = route(async (req) => {
  // На контуре с настоящими данными сброс выключается переменной окружения (D-015).
  if (process.env.DEMO_RESET_ENABLED === "false") throw new HttpError(404, "NOT_FOUND");
  const result = await resetDemoData(getClientIp(req.headers));
  if (!result.ok) {
    const res = fail(429, "RATE_LIMITED", { retryAfterSec: result.retryAfterSec });
    res.headers.set("Retry-After", String(result.retryAfterSec));
    return res;
  }
  return ok<DemoResetDTO>({ resetAt: result.resetAt });
});
