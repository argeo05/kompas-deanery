import { describe, expect, it } from "vitest";
import type { MessageDTO, RequestEventDTO } from "@/contracts/api";
import { requestConversation } from "@/components/requests/request-conversation";

const first: RequestEventDTO = {
  id: "event-one",
  fromStatus: "in_progress",
  toStatus: "needs_info",
  actor: "staff",
  actorName: "Елена М.",
  createdAt: "2026-11-18T09:00:00+03:00",
  comment: "За какой семестр нужна выписка?",
};
const reply: RequestEventDTO = {
  id: "event-reply",
  fromStatus: "needs_info",
  toStatus: "in_progress",
  actor: "student",
  actorName: null,
  createdAt: "2026-11-18T10:00:00+03:00",
  comment: null,
};
const second: RequestEventDTO = {
  ...first,
  id: "event-two",
  createdAt: "2026-11-18T11:00:00+03:00",
  comment: "Какое назначение указать в выписке?",
};
const message: MessageDTO = {
  id: "saved-one",
  author: "staff",
  authorName: first.actorName!,
  createdAt: first.createdAt,
  body: first.comment!,
};

describe("вопрос сотрудника в переписке по заявке", () => {
  it("у поля ответа последний вопрос, предыдущий вопрос и реплика студента идут по времени", () => {
    const answer: MessageDTO = {
      ...message,
      id: "answer",
      author: "student",
      authorName: "Максим",
      body: "За текущий",
      createdAt: reply.createdAt,
    };
    const { current, messages } = requestConversation({
      status: "needs_info",
      events: [first, reply, second],
      messages: [answer],
    });
    expect(current).toMatchObject({ body: second.comment, authorName: second.actorName });
    expect(messages.map((item) => item.body)).toEqual([first.comment, answer.body]);
  });
  it("при выходе из статуса вопрос остаётся обычной репликой, повтор в двух источниках виден один раз", () => {
    const pending = requestConversation({
      status: "needs_info",
      events: [first],
      messages: [message],
    });
    expect(pending.messages).toEqual([]);
    expect(pending.current?.body).toBe(message.body);
    const answered = requestConversation({
      status: "in_progress",
      events: [first, reply],
      messages: [message],
    });
    expect(answered.current).toBeUndefined();
    expect(answered.messages).toEqual([message]);
  });
  it.each([{ comment: null }, { actor: "system" as const }, { actor: "student" as const }])(
    "не подставляет прежний вопрос вместо последнего неполного события %o",
    (latest) => {
      const { current, messages } = requestConversation({
        status: "needs_info",
        events: [first, reply, { ...second, ...latest }],
        messages: [],
      });
      expect(current).toBeUndefined();
      expect(messages.map((item) => item.body)).toEqual([first.comment]);
    },
  );
  it("сохраняет самостоятельную реплику другого автора с тем же текстом и временем", () => {
    const another = { ...message, authorName: "Олег П." };
    const { current, messages } = requestConversation({
      status: "needs_info",
      events: [first],
      messages: [another],
    });
    expect(current?.authorName).toBe("Елена М.");
    expect(messages).toEqual([another]);
  });
});
