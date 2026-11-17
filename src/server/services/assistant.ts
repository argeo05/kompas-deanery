import "server-only";
import type { AssistantAnswerDTO, AssistantStatusDTO } from "@/contracts/api";
import { answerFromKb } from "@/lib/assistant/engine";
import { ASSISTANT_DAILY_LIMIT, consumeAssistantQuestion } from "../assistant-limit";
import type { Tx } from "../db";
import { HttpError } from "../http";
import { readAssistantConfig } from "./assistant-config";
import { askProvider } from "./assistant-llm";
import { listKbDocs } from "./kb";

// «Спросить Компас» (SPEC §6.8.2). Помощник не принимает идентификатор студента вообще: он отвечает
// по общему справочнику и не читает личных таблиц, поэтому чужие данные ему недоступны на уровне кода.

export function assistantStatus(): AssistantStatusDTO {
  const cfg = readAssistantConfig();
  return { enabled: cfg.enabled, mode: cfg.mode, dailyLimit: ASSISTANT_DAILY_LIMIT };
}

export async function askAssistant(
  tx: Tx,
  userId: string,
  question: string,
): Promise<AssistantAnswerDTO> {
  const cfg = readAssistantConfig();
  // Выключенный помощник для API не существует.
  if (!cfg.enabled) throw new HttpError(404, "NOT_FOUND");
  const remaining = await consumeAssistantQuestion(userId);
  if (remaining === null) throw new HttpError(429, "RATE_LIMITED");

  const docs = await listKbDocs(tx);
  const verdict = answerFromKb(question, docs);
  if (verdict.kind === "refused")
    return {
      kind: "refused",
      mode: cfg.mode,
      fallback: false,
      text: "",
      sources: [],
      refusal: verdict.reason,
      remaining,
    };
  if (verdict.kind === "not_found")
    return { kind: "not_found", mode: cfg.mode, fallback: false, text: "", sources: [], remaining };

  const sources = verdict.sources.map((s) => ({ ...s, href: `/help/${s.slug}` }));
  if (!cfg.provider)
    return {
      kind: "answer",
      mode: "deterministic",
      fallback: false,
      text: verdict.text,
      sources,
      remaining,
    };

  const generated = await askProvider(cfg.provider, question, verdict.context);
  if (generated === "")
    return { kind: "not_found", mode: "ai", fallback: false, text: "", sources: [], remaining };
  return {
    kind: "answer",
    mode: generated === null ? "deterministic" : "ai",
    fallback: generated === null,
    text: generated ?? verdict.text,
    sources,
    remaining,
  };
}
