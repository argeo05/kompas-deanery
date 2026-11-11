"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OutboxBadge } from "@/components/ui/status-badge";
import { formatWhen } from "@/lib/format";
import type { OutboxItem } from "@/lib/offline/outbox";
import { removeQueued, useOutbox } from "@/lib/offline/use-outbox";
import { useNow } from "@/lib/use-now";

// Заявки из офлайн-очереди над списком (SPEC §6.5 «Офлайн», §6.13 п.4): «Ожидает отправки» или
// «Не отправлено» с причиной и кнопкой «Удалить». Когда очередь уходит, список заявок обновляется.

const isRequest = (i: OutboxItem) => i.kind === "request.create" || i.kind === "request.resubmit";

export function QueuedRequests({ userId, onSent }: { userId: string; onSent: () => void }) {
  const items = useOutbox(userId, isRequest);
  const now = useNow();
  const count = React.useRef(items.length);

  // Элемент пропал из очереди — значит, ушёл на сервер: обновляем список.
  React.useEffect(() => {
    if (items.length < count.current) onSent();
    count.current = items.length;
  }, [items.length, onSent]);

  if (items.length === 0) return null;
  return (
    <section aria-labelledby="queued-title" className="flex flex-col gap-3">
      <h2 id="queued-title" className="type-h2">
        Ждут отправки
      </h2>
      <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
        {items.map((i) => (
          <li key={i.id}>
            <Card className="gap-2" data-testid="queued-request">
              <h3 className="type-h3">{i.label}</h3>
              <p className="type-caption text-ink-2">
                Создана {formatWhen(new Date(i.createdAt), now)}
              </p>
              <OutboxBadge state={i.state} />
              {i.state === "failed" ? (
                <>
                  <p>{i.error}</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="self-start"
                    aria-label={`Удалить неотправленную заявку «${i.label}»`}
                    onClick={() => {
                      void removeQueued(i.id);
                      // Карточка исчезает вместе с фокусом: возвращаем его к списку заявок (2.4.3).
                      document.getElementById("content")?.focus();
                    }}
                  >
                    Удалить
                  </Button>
                </>
              ) : (
                <p className="type-caption text-ink-2">
                  Отправим сами, когда появится сеть. Номер заявки появится после отправки.
                </p>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
