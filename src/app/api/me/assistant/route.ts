import type { AssistantAnswerDTO, AssistantStatusDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { ok, parseJson, route } from "@/server/http";
import { assistantBody } from "@/server/schemas/assistant";
import { askAssistant, assistantStatus } from "@/server/services/assistant";

// «Спросить Компас» (SPEC §6.8.2). Ключ ИИ-провайдера живёт только в окружении сервера; браузер ходит сюда.

/** GET /api/me/assistant → 200 AssistantStatusDTO (включён ли помощник и в каком режиме) */
export const GET = route(async (req) => {
  await requireStudent(req);
  return ok<AssistantStatusDTO>(assistantStatus());
});

/** POST /api/me/assistant { question } → 200 AssistantAnswerDTO; помощник выключен → 404; лимит → 429 */
export const POST = route(async (req) => {
  const me = await requireStudent(req);
  const { question } = await parseJson(req, assistantBody);
  return ok<AssistantAnswerDTO>(
    await withUserTx(me.userId, (tx) => askAssistant(tx, me.userId, question)),
  );
});
