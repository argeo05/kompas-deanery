import type { MessageDTO, RequestDetailDTO } from "@/contracts/api";
import { formatDayMonth, formatTimeMsk } from "@/lib/format";

// Сотрудник задаёт вопрос при смене статуса. Текст находится в истории, а обычные реплики — в messages.
export function requestConversation(
  request: Pick<RequestDetailDTO, "status" | "events" | "messages">,
) {
  const lastEvent = request.events.at(-1);
  const messages = [...request.messages];
  let current: MessageDTO | undefined;
  for (const event of request.events) {
    if (event.toStatus !== "needs_info" || event.actor !== "staff" || !event.comment?.trim())
      continue;
    const question: MessageDTO = {
      id: `event-${event.id}`,
      author: "staff",
      authorName: event.actorName ?? "Сотрудник",
      createdAt: event.createdAt,
      body: event.comment,
    };
    const storedIndex = request.messages.findIndex(
      (m) =>
        m.author === "staff" &&
        m.authorName === question.authorName &&
        m.createdAt === event.createdAt &&
        m.body.trim() === question.body.trim(),
    );
    if (request.status === "needs_info" && event.id === lastEvent?.id) {
      current = question;
      if (storedIndex >= 0) messages.splice(storedIndex, 1);
    } else if (storedIndex < 0) {
      messages.push(question);
    }
  }
  messages.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return { messages, current };
}

export function Clarification({ question, id }: { question: MessageDTO; id?: string }) {
  return (
    <div
      data-testid="needs-info"
      className="flex flex-col gap-1 rounded-control border-l-4 border-l-warn bg-surface-2 p-3"
    >
      <p className="type-caption text-ink-2">
        Вопрос сотрудника · {question.authorName} · {formatDayMonth(question.createdAt)},{" "}
        {formatTimeMsk(question.createdAt)}
      </p>
      <p id={id} className="whitespace-pre-wrap">
        {question.body}
      </p>
    </div>
  );
}
