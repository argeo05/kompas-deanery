import { z } from "zod";
import { MAX_QUESTION_CHARS } from "@/lib/assistant/engine";

/** POST /api/me/assistant — вопрос 2–500 символов; лишние поля (studentId и прочее) отбрасываются. */
export const assistantBody = z.object({
  question: z.string().trim().min(2).max(MAX_QUESTION_CHARS),
});
export type AssistantBody = z.output<typeof assistantBody>;
