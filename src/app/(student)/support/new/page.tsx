import type { Metadata } from "next";
import { Suspense } from "react";
import { NewTicketScreen } from "@/components/support/support-screens";
import type { TicketCreateBody, TicketTopic } from "@/contracts/api";

export const metadata: Metadata = { title: "Написать в деканат — Компас" };

const TOPICS = new Set<TicketTopic>([
  "schedule",
  "grades",
  "requests",
  "dorm",
  "scholarship",
  "other",
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Тема и ссылка на объект приходят из адреса (кнопка «Написать через Компас» в карточке пары или
// дисциплины). Сервер всё равно проверяет, что объект принадлежит студенту.
export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; kind?: string; id?: string }>;
}) {
  const { topic, kind, id } = await searchParams;
  const t = TOPICS.has(topic as TicketTopic) ? (topic as TicketTopic) : "other";
  const link: TicketCreateBody["link"] | null =
    (kind === "class" || kind === "course" || kind === "request") && id && UUID_RE.test(id)
      ? { kind, id }
      : null;
  return (
    <Suspense>
      <NewTicketScreen topic={t} link={link} />
    </Suspense>
  );
}
