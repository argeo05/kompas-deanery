"use client";

import * as React from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import type { ClassDTO, ClassNoteDTO } from "@/contracts/api";
import { formatDateLong } from "@/lib/format";
import { downloadClassIcs } from "@/lib/ics-client";
import { ChangeNote } from "./class-card";
import { CLASS_TYPE_LABEL, roomText, timeRange } from "./class-meta";

// Карточка пары (SPEC §6.3 п.6): дисциплина, преподаватель, аудитория и «как пройти», тип, неделя,
// изменение, личная заметка (видна только автору) и «Добавить в календарь».

const PARITY = { odd: "числитель", even: "знаменатель" } as const;

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="type-caption text-ink-2">{term}</dt>
      <dd className="type-body">{children}</dd>
    </div>
  );
}

function NoteEditor({ cls, onSaved }: { cls: ClassDTO; onSaved: () => void }) {
  const [status, setStatus] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [text, setText] = React.useState(cls.note ?? "");
  const [pending, setPending] = React.useState(false);
  const id = React.useId();

  async function save() {
    setPending(true);
    try {
      const res = await fetch(`/api/me/classes/${cls.id}/note`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const saved = (await res.json()) as ClassNoteDTO;
      setText(saved.note ?? "");
      setStatus({ ok: true, text: saved.note ? "Заметка сохранена" : "Заметка удалена" });
      onSaved();
    } catch {
      // Тост здесь не виден: модальный лист закрывает остальную страницу. Результат — внутри листа.
      setStatus({
        ok: false,
        text: "Не получилось сохранить заметку. Проверьте интернет и попробуйте ещё раз.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="type-caption text-ink-2">
        Личная заметка — её видите только вы
      </label>
      <textarea
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500}
        rows={3}
        className="w-full rounded-control border border-line-strong bg-surface p-3 text-base text-ink"
      />
      <Button variant="secondary" onClick={save} loading={pending} className="self-start">
        Сохранить заметку
      </Button>
      <p
        role="status"
        className={status?.ok === false ? "type-caption text-alert-fg" : "type-caption text-ink-2"}
      >
        {status?.text}
      </p>
    </div>
  );
}

export function ClassSheet({
  cls,
  onClose,
  onChanged,
}: {
  cls: ClassDTO | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const marked = React.useRef<string | null>(null);

  // Студент увидел изменение — hero на «Сегодня» перестаёт его закреплять (SPEC §6.2 п.3).
  React.useEffect(() => {
    const change = cls?.change;
    if (!change || change.seen || marked.current === change.id) return;
    marked.current = change.id;
    void fetch("/api/me/schedule/changes/seen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ changeIds: [change.id] }),
    })
      .then((res) => res.ok && onChanged())
      .catch(() => undefined);
  }, [cls?.change, onChanged]);

  return (
    <Sheet
      open={cls !== null}
      onOpenChange={(open) => !open && onClose()}
      title={cls?.course.title ?? "Пара"}
      description={
        cls ? `${CLASS_TYPE_LABEL[cls.type]} · ${formatDateLong(cls.startsAt)}` : undefined
      }
    >
      {cls && (
        <div className="flex flex-col gap-4">
          <ChangeNote cls={cls} />
          <dl className="flex flex-col gap-3">
            <Row term="Время">{timeRange(cls)}</Row>
            <Row term="Где аудитория">
              {roomText(cls.room)}
              {cls.room.floor !== null && `, ${cls.room.floor}-й этаж`}
              {cls.room.hint && (
                <span className="block type-caption text-ink-2">{cls.room.hint}</span>
              )}
            </Row>
            <Row term="Преподаватель">
              {cls.teacher.fullName}
              {cls.teacher.email && (
                <span className="block type-caption text-ink-2">Почта: {cls.teacher.email}</span>
              )}
              {cls.teacher.officeHours && (
                <span className="block type-caption text-ink-2">
                  Консультации: {cls.teacher.officeHours}
                </span>
              )}
            </Row>
            {cls.weekParity && <Row term="Неделя">{PARITY[cls.weekParity]}</Row>}
          </dl>
          <NoteEditor key={cls.id} cls={cls} onSaved={onChanged} />
          <Button variant="secondary" onClick={() => downloadClassIcs(cls)} className="self-start">
            <CalendarPlus aria-hidden />
            Добавить в календарь
          </Button>
        </div>
      )}
    </Sheet>
  );
}
