import "server-only";
import type { AssistantMode } from "@/contracts/api";

// Настройки помощника только из окружения сервера (C-24). Ключ никогда не попадает в ответы API,
// логи и клиентский код; в браузер уходит лишь режим («deterministic» или «ai»).
//
//   AI_ASSISTANT=true        включает помощника (по умолчанию выключен, D-016)
//   AI_PROVIDER_URL          полный адрес chat/completions у провайдера с OpenAI-совместимым API
//   AI_API_KEY               ключ провайдера
//   AI_MODEL                 идентификатор модели
//   AI_AUTH_SCHEME           "Bearer" (по умолчанию) или "Api-Key"

export interface ProviderConfig {
  url: string;
  key: string;
  model: string;
  scheme: string;
}

export interface AssistantConfig {
  enabled: boolean;
  mode: AssistantMode;
  provider: ProviderConfig | null;
}

export function readAssistantConfig(
  env: Record<string, string | undefined> = process.env,
): AssistantConfig {
  const enabled = ["1", "true"].includes((env.AI_ASSISTANT ?? "").trim().toLowerCase());
  const url = env.AI_PROVIDER_URL?.trim();
  const key = env.AI_API_KEY?.trim();
  const model = env.AI_MODEL?.trim();
  const provider =
    enabled && url && key && model && url.startsWith("https://")
      ? { url, key, model, scheme: env.AI_AUTH_SCHEME?.trim() || "Bearer" }
      : null;
  return { enabled, mode: provider ? "ai" : "deterministic", provider };
}
