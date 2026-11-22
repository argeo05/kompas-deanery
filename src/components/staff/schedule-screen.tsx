"use client";

import * as React from "react";
import { Pencil, TriangleAlert, Users } from "lucide-react";
import { ApiView } from "@/components/screens/api-view";
import { CHANGE_META, CLASS_TYPE_LABEL, roomText } from "@/components/schedule/class-meta";
import { useStaff } from "@/components/shell/staff-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckRow, Field, SelectInput, TextInput } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { LoadingRegion, SkeletonCard } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import type {
  ScheduleChangeCreateBody,
  StaffClassDTO,
  StaffClassesDTO,
  StaffReferenceDTO,
} from "@/contracts/api";
import { formatTimeMsk, plural } from "@/lib/format";
import { sendJson } from "@/lib/send-json";
import { addDaysMsk, toMskDate } from "@/lib/time";
import { useApi } from "@/lib/use-api";

// Изменения расписания (SPEC §6.9 п.4): найти пару на день → отменить / перенести / сменить
// аудиторию или преподавателя → причина → сохранить. Перед сохранением показываем, сколько студентов
// получит уведомление: это защита от ошибки «перенёс не ту пару».

type ChangeType = ScheduleChangeCreateBody["type"];

const TYPES: { value: ChangeType; label: string }[] = [
  { value: "cancelled", label: "Отменить пару" },
  { value: "moved", label: "Перенести на другое время" },
  { value: "room_changed", label: "Сменить аудиторию" },
  { value: "teacher_changed", label: "Сменить преподавателя" },
];

const hhmm = (iso: string) => formatTimeMsk(iso);

function ChangeSheet({
  cls,
  reference,
  onOpenChange,
  onDone,
}: {
  cls: StaffClassDTO;
  reference: StaffReferenceDTO | undefined;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [type, setType] = React.useState<ChangeType>("moved");
  const [date, setDate] = React.useState(toMskDate(cls.startsAt));
  const [from, setFrom] = React.useState(hhmm(cls.startsAt));
  const [to, setTo] = React.useState(hhmm(cls.endsAt));
  const [roomId, setRoomId] = React.useState("");
  const [teacherId, setTeacherId] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const idemKey = React.useRef(crypto.randomUUID());

  const effectiveDay = type === "moved" ? date : toMskDate(cls.startsAt);
  const today = toMskDate(new Date());
  const urgent = effectiveDay === today || effectiveDay === toMskDate(addDaysMsk(new Date(), 1));
  const n = cls.audienceSize;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    const body: ScheduleChangeCreateBody = {
      type,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    };
    if (type === "moved") {
      if (!date || !from || !to) next.when = "Укажите дату и время начала и конца";
      else if (to <= from) next.when = "Конец пары должен быть позже начала";
      else {
        body.newStartsAt = `${date}T${from}:00+03:00`;
        body.newEndsAt = `${date}T${to}:00+03:00`;
      }
    }
    if (type === "room_changed") {
      if (!roomId) next.room = "Выберите аудиторию";
      else body.newRoomId = roomId;
    }
    if (type === "teacher_changed") {
      if (!teacherId) next.teacher = "Выберите преподавателя";
      else body.newTeacherId = teacherId;
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    const res = await sendJson(
      "POST",
      `/api/staff/classes/${cls.id}/changes`,
      body,
      idemKey.current,
    );
    setBusy(false);
    if (res.ok) {
      toast({
        tone: "success",
        title: `Изменение сохранено. Уведомили студентов: ${n}`,
      });
      onDone();
    } else if (res.status === 422)
      setErrors({ form: "Сервер не принял значения. Проверьте поля." });
    else setErrors({ form: "Не получилось сохранить. Повторите: дубль не создастся." });
  };

  return (
    <Sheet
      open
      onOpenChange={onOpenChange}
      title="Изменить пару"
      description={`${cls.course.title}, ${CLASS_TYPE_LABEL[cls.type].toLowerCase()}, ${hhmm(cls.startsAt)}–${hhmm(cls.endsAt)}`}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <fieldset className="flex flex-col">
          <legend className="font-medium">Что сделать</legend>
          {TYPES.map((t) => (
            <CheckRow
              key={t.value}
              type="radio"
              name="change-type"
              label={t.label}
              checked={type === t.value}
              onChange={() => setType(t.value)}
            />
          ))}
        </fieldset>

        {type === "moved" && (
          <div className="flex flex-col gap-3">
            <Field label="Новая дата (МСК)" error={errors.when}>
              {(p) => (
                <TextInput
                  {...p}
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Начало">
                {(p) => (
                  <TextInput
                    {...p}
                    type="time"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Конец">
                {(p) => (
                  <TextInput
                    {...p}
                    type="time"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                )}
              </Field>
            </div>
          </div>
        )}
        {type === "room_changed" && (
          <Field label="Новая аудитория" error={errors.room}>
            {(p) => (
              <SelectInput {...p} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                <option value="">Выберите</option>
                {(reference?.rooms ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        )}
        {type === "teacher_changed" && (
          <Field label="Новый преподаватель" error={errors.teacher}>
            {(p) => (
              <SelectInput {...p} value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="">Выберите</option>
                {(reference?.teachers ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        )}
        <Field label="Причина" optional hint="Студенты увидят её в уведомлении. До 200 символов.">
          {(p) => (
            <TextInput
              {...p}
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>

        <div
          data-testid="impact"
          className="flex gap-2 rounded-control border border-warn bg-warn-bg p-3 text-warn-fg"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
          <p>
            Изменение увидят {n} {plural(n, ["студент", "студента", "студентов"])}
            {cls.group ? ` группы ${cls.group.title}` : " потока"}.{" "}
            {urgent
              ? "Пара сегодня или завтра, поэтому уведомление будет срочным."
              : "Уведомление придёт обычное: пара не раньше чем послезавтра."}
          </p>
        </div>
        {errors.form && (
          <p role="alert" className="text-coral-fg">
            {errors.form}
          </p>
        )}
        <Button type="submit" loading={busy} className="py-2 whitespace-normal">
          <Users aria-hidden />
          Сохранить и уведомить {n} {plural(n, ["студента", "студентов", "студентов"])}
        </Button>
      </form>
    </Sheet>
  );
}

function ClassRow({ cls, onEdit }: { cls: StaffClassDTO; onEdit: () => void }) {
  const meta = cls.change ? CHANGE_META[cls.change.type] : null;
  return (
    <Card variant={meta ? "highlight" : "default"} data-testid="staff-class">
      <div className="flex flex-wrap items-center gap-2">
        <p className="type-num font-semibold">
          {hhmm(cls.startsAt)}–{hhmm(cls.endsAt)}
        </p>
        {meta && (
          <Badge tone={meta.tone} icon={meta.icon}>
            {meta.label}
          </Badge>
        )}
      </div>
      <h2 className="type-h3">{cls.course.title}</h2>
      <p className="type-caption text-ink-2">
        {CLASS_TYPE_LABEL[cls.type]} · {roomText(cls.room)} · {cls.teacher.fullName}
      </p>
      <p className="type-caption text-ink-2">
        {cls.group ? `Группа ${cls.group.title}` : "Поток"} · студентов: {cls.audienceSize}
      </p>
      <Button variant="secondary" size="sm" className="self-start" onClick={onEdit}>
        <Pencil aria-hidden />
        Изменить
        <span className="sr-only">
          : {cls.course.title}, {hhmm(cls.startsAt)}
        </span>
      </Button>
    </Card>
  );
}

export function StaffScheduleScreen() {
  const { userId } = useStaff();
  const [date, setDate] = React.useState(() => toMskDate(new Date()));
  const [groupId, setGroupId] = React.useState("");
  const [editing, setEditing] = React.useState<string | null>(null);
  const url = `/api/staff/classes?date=${date}${groupId ? `&groupId=${groupId}` : ""}`;
  const api = useApi<StaffClassesDTO>(date ? url : null, { scope: userId });
  const ref = useApi<StaffReferenceDTO>("/api/staff/reference", { scope: userId });

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="type-h1">Изменения расписания</h1>
        <p className="text-ink-2">Выберите день и пару. Студенты узнают об изменении сразу.</p>
      </header>
      <form
        onSubmit={(e) => e.preventDefault()}
        aria-label="Какие пары показать"
        className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl"
      >
        <Field label="День">
          {(p) => (
            <TextInput {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          )}
        </Field>
        <Field label="Группа">
          {(p) => (
            <SelectInput {...p} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">Все группы</option>
              {(ref.data?.groups ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
      </form>
      <ApiView
        api={api}
        skeleton={
          <LoadingRegion label="Загружаем пары…">
            <SkeletonCard />
            <SkeletonCard />
          </LoadingRegion>
        }
      >
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState illustration="free-day" title="В этот день пар нет">
              Выберите другой день или другую группу.
            </EmptyState>
          ) : (
            <>
              <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
                {data.items.map((c) => (
                  <li key={c.id}>
                    <ClassRow cls={c} onEdit={() => setEditing(c.id)} />
                  </li>
                ))}
              </ul>
              {data.items
                .filter((c) => c.id === editing)
                .map((c) => (
                  <ChangeSheet
                    key={c.id}
                    cls={c}
                    reference={ref.data}
                    onOpenChange={(v) => !v && setEditing(null)}
                    onDone={() => {
                      setEditing(null);
                      api.reload();
                    }}
                  />
                ))}
            </>
          )
        }
      </ApiView>
    </>
  );
}
