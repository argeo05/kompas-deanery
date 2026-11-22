"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send, TriangleAlert, Users } from "lucide-react";
import { ApiView } from "@/components/screens/api-view";
import { useStaff } from "@/components/shell/staff-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckRow, Field, TextArea, TextInput } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { LoadingRegion, SkeletonCard } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import type { AudienceCountDTO, StaffReferenceDTO } from "@/contracts/api";
import { plural } from "@/lib/format";
import { SafeMarkdown } from "@/lib/markdown";
import { sendJson } from "@/lib/send-json";
import { ANNOUNCEMENT_TEMPLATES } from "@/lib/staff-templates";
import { useApi } from "@/lib/use-api";
import { TemplatePicker } from "./template-picker";

// Новое объявление (SPEC §6.9 п.3): заголовок, Markdown с предпросмотром «как увидит студент»
// (ширина 360 px), аудитория с живым подсчётом получателей, «Важно», публикация сейчас или по времени.

const COURSES = [1, 2, 3, 4, 5, 6];

/** Значение datetime-local («2026-11-12T09:00») → ISO со смещением Москвы. */
const toIso = (local: string) => `${local}:00+03:00`;

function Preview({ title, body, important }: { title: string; body: string; important: boolean }) {
  return (
    <section aria-labelledby="preview-title" className="flex flex-col gap-2">
      <h2 id="preview-title" className="type-h2">
        Как увидит студент
      </h2>
      <p className="type-caption text-ink-2">Ширина экрана телефона, 360 пикселей.</p>
      <div
        data-testid="announcement-preview"
        className="w-full max-w-90 rounded-card border border-line-strong bg-bg p-3"
      >
        <Card className="gap-2">
          {important && (
            <Badge tone="coral" icon={TriangleAlert}>
              Важно
            </Badge>
          )}
          <h3 className="type-h3">{title.trim() || "Заголовок объявления"}</h3>
          {body.trim() ? (
            <SafeMarkdown source={body} className="flex flex-col gap-2" />
          ) : (
            <p className="text-ink-2">Здесь появится текст объявления.</p>
          )}
        </Card>
      </div>
    </section>
  );
}

function Form({ reference }: { reference: StaffReferenceDTO }) {
  const { userId } = useStaff();
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [important, setImportant] = React.useState(false);
  const [courses, setCourses] = React.useState<number[]>([]);
  const [groupIds, setGroupIds] = React.useState<string[]>([]);
  const [facultyIds, setFacultyIds] = React.useState<string[]>([]);
  const [when, setWhen] = React.useState<"now" | "later">("now");
  const [publishAt, setPublishAt] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const idemKey = React.useRef(crypto.randomUUID());

  const multiFaculty = reference.faculties.length > 1;
  // Ничего не выбрано — все факультеты, доступные сотруднику (их и показывает список).
  // Так подсказка «если ничего не выбрано…» правдива, а счётчик получателей сразу считает
  // аудиторию по умолчанию (C11: раньше он навсегда оставался «Считаем получателей…»).
  // Сотрудник одного факультета публикует в свой: без этого «1 курс» увидел бы весь вуз.
  const allFaculties = React.useMemo(() => reference.faculties.map((f) => f.id), [reference]);
  const effectiveFaculties = multiFaculty && facultyIds.length > 0 ? facultyIds : allFaculties;

  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const countUrl = React.useMemo(() => {
    const p = new URLSearchParams();
    if (effectiveFaculties.length) p.set("facultyIds", effectiveFaculties.join(","));
    if (courses.length) p.set("courses", courses.join(","));
    if (groupIds.length) p.set("groupIds", groupIds.join(","));
    return p.toString() ? `/api/staff/audience?${p.toString()}` : null;
  }, [effectiveFaculties, courses, groupIds]);
  const count = useApi<AudienceCountDTO>(countUrl, { scope: userId });

  const visibleGroups = reference.groups.filter(
    (g) =>
      (courses.length === 0 || courses.includes(g.course)) &&
      (!multiFaculty || facultyIds.length === 0 || facultyIds.includes(g.facultyId)),
  );

  // Сначала проверка и подтверждение «для N студентов», затем отправка (publish).
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Напишите заголовок: он виден в ленте";
    if (!body.trim()) next.body = "Напишите текст объявления";
    if (effectiveFaculties.length === 0 && courses.length === 0 && groupIds.length === 0)
      next.audience = "Выберите, кому показать объявление";
    if (when === "later" && !publishAt) next.publishAt = "Укажите дату и время публикации";
    if (publishAt && expiresAt && expiresAt <= publishAt)
      next.expiresAt = "Срок окончания должен быть позже публикации";
    setErrors(next);
    if (Object.keys(next).length) return;
    setConfirming(true);
  };

  const publish = async () => {
    setBusy(true);
    const res = await sendJson(
      "POST",
      "/api/staff/announcements",
      {
        title: title.trim(),
        bodyMd: body.trim(),
        important,
        audience: {
          ...(effectiveFaculties.length ? { facultyIds: effectiveFaculties } : {}),
          ...(courses.length ? { courses } : {}),
          ...(groupIds.length ? { groupIds } : {}),
        },
        ...(when === "later" && publishAt ? { publishAt: toIso(publishAt) } : {}),
        ...(expiresAt ? { expiresAt: toIso(expiresAt) } : {}),
      },
      idemKey.current,
    );
    setBusy(false);
    setConfirming(false);
    if (res.ok) {
      toast({
        tone: "success",
        title:
          when === "later"
            ? "Объявление запланировано"
            : important
              ? "Объявление опубликовано. Студенты получат срочное уведомление"
              : "Объявление опубликовано. Студенты увидят его в ленте и в ближайшем дайджесте",
      });
      router.push("/staff/announcements");
    } else if (res.status === 422) {
      setErrors({ form: "Проверьте аудиторию и даты: в них есть ошибка." });
    } else setErrors({ form: "Не получилось опубликовать. Повторите: дубль не создастся." });
  };

  const n = count.data?.students;
  const forWhom =
    n === undefined ? "" : ` для ${n} ${plural(n, ["студента", "студентов", "студентов"])}`;
  const verb = when === "later" ? "Запланировать" : "Опубликовать";

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start"
      aria-label="Новое объявление"
    >
      <div className="flex flex-col gap-4">
        <Field label="Заголовок" error={errors.title}>
          {(p) => (
            <TextInput
              {...p}
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Field>
        <TemplatePicker
          templates={ANNOUNCEMENT_TEMPLATES}
          label="Заготовки текста"
          onPick={(t) => setBody(t)}
        />
        <Field
          label="Текст"
          hint="Можно **жирный**, *курсив*, списки через «-», заголовки через «##» и [ссылки](https://…)."
          error={errors.body}
        >
          {(p) => (
            <TextArea
              {...p}
              rows={8}
              maxLength={5000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          )}
        </Field>

        <fieldset
          className="flex min-w-0 flex-col gap-1 wrap-anywhere"
          aria-describedby="audience-count"
        >
          <legend className="type-h3">Кому показать</legend>
          {multiFaculty && (
            <div className="flex flex-col">
              <p className="font-medium">Факультет</p>
              {reference.faculties.map((f) => (
                <CheckRow
                  key={f.id}
                  label={f.title}
                  checked={facultyIds.includes(f.id)}
                  onChange={() => setFacultyIds(toggle(facultyIds, f.id))}
                />
              ))}
            </div>
          )}
          <div className="flex flex-col">
            <p className="font-medium">Курс</p>
            <div className="flex flex-wrap gap-x-4">
              {COURSES.map((c) => (
                <CheckRow
                  key={c}
                  label={`${c} курс`}
                  checked={courses.includes(c)}
                  onChange={() => setCourses(toggle(courses, c))}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col">
            <p className="font-medium">Группа</p>
            <div className="flex flex-wrap gap-x-4">
              {visibleGroups.map((g) => (
                <CheckRow
                  key={g.id}
                  label={`${g.title} · ${g.students} ${plural(g.students, ["студент", "студента", "студентов"])}`}
                  checked={groupIds.includes(g.id)}
                  onChange={() => setGroupIds(toggle(groupIds, g.id))}
                />
              ))}
            </div>
          </div>
          <p className="type-caption text-ink-2">
            {multiFaculty
              ? "Если ничего не выбрано, объявление увидят студенты всех факультетов из списка."
              : "Если ничего не выбрано, объявление увидит весь ваш факультет."}{" "}
            Выбранные признаки сужают аудиторию: курс и группа вместе дают только студентов этой
            группы нужного курса.
          </p>
          <p
            id="audience-count"
            role="status"
            data-testid="audience-count"
            className="inline-flex items-center gap-2 font-medium"
          >
            <Users aria-hidden className="size-5" />
            {count.error
              ? "Не получилось посчитать получателей: проверьте интернет."
              : n === undefined
                ? "Считаем получателей…"
                : n === 0
                  ? "Под эти признаки не подходит ни один студент"
                  : `Увидят ${n} ${plural(n, ["студент", "студента", "студентов"])}`}
          </p>
          {errors.audience && <p className="type-caption text-coral-fg">{errors.audience}</p>}
        </fieldset>

        <CheckRow
          label="Важно"
          hint="Студенты получат срочное уведомление (ночью — после окончания тихих часов), объявление выделится в ленте. Перед публикацией попросим подтвердить."
          checked={important}
          onChange={(e) => setImportant(e.target.checked)}
        />

        <fieldset className="flex flex-col">
          <legend className="font-medium">Когда опубликовать</legend>
          <CheckRow
            type="radio"
            name="when"
            label="Сейчас"
            checked={when === "now"}
            onChange={() => setWhen("now")}
          />
          <CheckRow
            type="radio"
            name="when"
            label="По времени"
            checked={when === "later"}
            onChange={() => setWhen("later")}
          />
        </fieldset>
        {when === "later" && (
          <Field label="Дата и время публикации (МСК)" error={errors.publishAt}>
            {(p) => (
              <TextInput
                {...p}
                type="datetime-local"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
              />
            )}
          </Field>
        )}
        <Field label="Актуально до (МСК)" optional error={errors.expiresAt}>
          {(p) => (
            <TextInput
              {...p}
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          )}
        </Field>

        {errors.form && (
          <p role="alert" className="text-coral-fg">
            {errors.form}
          </p>
        )}
        <Button
          type="submit"
          loading={busy}
          className="max-w-full self-start py-2 whitespace-normal"
        >
          <Send aria-hidden />
          {verb}
          {forWhom}
        </Button>
        <Sheet
          open={confirming}
          onOpenChange={setConfirming}
          title={when === "later" ? "Запланировать объявление?" : "Опубликовать объявление?"}
          description={title.trim()}
        >
          <div className="flex flex-col gap-3" data-testid="announcement-confirm">
            <p>
              {n === undefined
                ? "Число получателей ещё считается."
                : `Его увидят ${n} ${plural(n, ["студент", "студента", "студентов"])}.`}{" "}
              После публикации объявление можно только убрать в архив, изменить его нельзя.
            </p>
            {important && (
              <p className="flex items-start gap-2 type-body-strong">
                <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-warn" />
                Отмечено «Важно»: каждый получит срочное уведомление, в тихие часы — после их
                окончания.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button loading={busy} onClick={publish} className="whitespace-normal">
                {verb}
                {forWhom}
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Вернуться к тексту
              </Button>
            </div>
          </div>
        </Sheet>
      </div>
      <Preview title={title} body={body} important={important} />
    </form>
  );
}

export function AnnouncementFormScreen() {
  const { userId } = useStaff();
  const ref = useApi<StaffReferenceDTO>("/api/staff/reference", { scope: userId });
  return (
    <>
      <header className="flex flex-col gap-1">
        <Button asChild variant="link" size="sm" className="self-start">
          <Link href="/staff/announcements">
            <ArrowLeft aria-hidden className="size-4" />К объявлениям
          </Link>
        </Button>
        <h1 className="type-h1">Новое объявление</h1>
      </header>
      <ApiView
        api={ref}
        skeleton={
          <LoadingRegion label="Готовим форму…">
            <SkeletonCard />
            <SkeletonCard />
          </LoadingRegion>
        }
      >
        {(reference) => <Form reference={reference} />}
      </ApiView>
    </>
  );
}
