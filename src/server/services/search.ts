import "server-only";
import { sql } from "drizzle-orm";
import type {
  ClassDTO,
  RequestStatus,
  SearchDTO,
  SearchGroupDTO,
  SearchHitDTO,
} from "@/contracts/api";
import { now } from "@/lib/clock";
import { formatDayMonth, formatTimeMsk, formatWhen } from "@/lib/format";
import { expandQuery, normalizeQuery } from "@/lib/search-synonyms";
import { addDaysMsk, toMskDate } from "@/lib/time";
import type { StudentCtx } from "../auth/guards";
import type { Tx } from "../db";
import { listDeadlinesForStudent } from "../repositories/deadlines";
import { listRequestsForStudent } from "../repositories/requests";
import { listMyCourseIds } from "../repositories/schedule";
import { listStudentAnnouncements } from "./announcements";
import { getMySchedule } from "./schedule";

// Поиск студента (SPEC §6.10, AC-10.1–10.3). Всё, что возвращается, выбрано из объектов,
// доступных этому студенту: пары — его группы и записей (время уже с учётом переносов, как
// в «Дне»), дедлайны и заявки — только свои, объявления — через ту же видимость, что и лента.
// Справочники (типы заявок, справочник) общие. Опечатки — pg_trgm (similarity),
// разговорные слова — словарь синонимов (src/lib/search-synonyms.ts).

const HORIZON_DAYS = 21;
const TRGM_MIN = 0.3;
const LIMIT = 5;
const REQUESTS_SCAN = 200;

/** Подписи статусов — те же, что у бейджа в списке заявок (REQUEST_STATUS в status-badge). */
const REQUEST_STATUS_HINT: Record<RequestStatus, string> = {
  submitted: "Отправлена",
  in_progress: "В работе",
  needs_info: "Нужно уточнение",
  ready: "Готова",
  issued: "Выдана",
  rejected: "Отклонена",
  cancelled: "Отменена",
};

/** Массив text[] из значений: параметры по одному, чтобы драйвер не склеивал их в кортеж. */
const arr = (values: string[]) =>
  values.length === 0
    ? sql`'{}'::text[]`
    : sql`array[${sql.join(
        values.map((v) => sql`${v}`),
        sql`, `,
      )}]::text[]`;

const like = (s: string) => `%${s.replace(/[\\%_]/g, "\\$&")}%`;

type Row = Record<string, unknown>;

async function rows<T extends Row>(tx: Tx, query: ReturnType<typeof sql>): Promise<T[]> {
  return (await tx.execute(query)) as unknown as T[];
}

/** Действия: типы заявок (заголовок и синонимы) и два постоянных действия. */
async function actions(tx: Tx, terms: string[], q: string): Promise<SearchHitDTO[]> {
  const found = await rows<{ code: string; title: string; score: number }>(
    tx,
    sql`
      select code, title,
        greatest(
          case when exists (select 1 from unnest(synonyms) s where lower(replace(s,'ё','е')) = any(${arr(terms)})) then 3 else 0 end,
          case when exists (select 1 from unnest(synonyms) s where lower(replace(s,'ё','е')) like any(${arr(terms.map(like))})) then 2 else 0 end,
          case when lower(replace(title,'ё','е')) like any(${arr(terms.map(like))}) then 1.5 else 0 end,
          word_similarity(${q}, lower(replace(title,'ё','е')))
        ) as score
      from request_types
      order by score desc, sort_order
    `,
  );
  const hits: SearchHitDTO[] = found
    .filter((r) => Number(r.score) >= TRGM_MIN + 0.1)
    .slice(0, LIMIT)
    .map((r) => ({
      id: r.code,
      title:
        r.title.toLowerCase().startsWith("справка") || r.title.toLowerCase().startsWith("выписка")
          ? `Заказать: ${r.title[0]!.toLowerCase()}${r.title.slice(1)}`
          : r.title,
      hint: "Заявка",
      href: `/requests/new/${r.code}`,
    }));
  const fixed: Array<[string, string, string[]]> = [
    ["Написать в деканат", "/support/new", ["деканат", "обращение", "вопрос", "написать", "связь"]],
    ["Подписаться на календарь", "/schedule#calendar", ["календарь", "ics", "google", "подписка"]],
    ["Настроить уведомления", "/notifications/settings", ["уведомления", "дайджест", "тихие"]],
  ];
  for (const [title, href, keys] of fixed) {
    if (terms.some((t) => keys.some((k) => k.includes(t) || t.includes(k))))
      hits.push({ id: href, title, hint: "Действие", href });
  }
  return hits;
}

async function kb(tx: Tx, terms: string[], q: string): Promise<SearchHitDTO[]> {
  const tsq = terms.join(" ");
  const found = await rows<{ slug: string; title: string }>(
    tx,
    sql`
      select slug, title from kb_articles
      where tsv @@ websearch_to_tsquery('russian', ${tsq})
         or lower(replace(title,'ё','е')) like any(${arr(terms.map(like))})
         or word_similarity(${q}, lower(replace(title,'ё','е'))) >= ${TRGM_MIN + 0.2}
         or exists (select 1 from unnest(tags) t where lower(replace(t,'ё','е')) = any(${arr(terms)}))
      order by
        (lower(replace(title,'ё','е')) like any(${arr(terms.map(like))})) desc,
        ts_rank(tsv, websearch_to_tsquery('russian', ${tsq})) desc
      limit ${LIMIT}
    `,
  );
  return found.map((r) => ({
    id: r.slug,
    title: r.title,
    hint: "Справочник",
    href: `/help/${r.slug}`,
  }));
}

/** Вторая строка пары: перенос и отмена видны прямо в выдаче. */
function classHint(u: ClassDTO, at: Date): string {
  const room = `ауд. ${u.room.number}`;
  const c = u.change;
  if (c?.type === "cancelled") return "Отменена";
  if (c?.type === "moved" && c.previous) {
    const sameDay = c.previous.startsAt.slice(0, 10) === u.startsAt.slice(0, 10);
    const was = sameDay
      ? formatTimeMsk(c.previous.startsAt)
      : formatWhen(c.previous.startsAt, at).replace(/^(сегодня|завтра|вчера) в /, "$1, ");
    return `Перенесена, было ${was} · ${room}`;
  }
  if (c?.type === "room_changed" && c.previous) return `Новая аудитория: ${u.room.number}`;
  return `Ауд. ${u.room.number}`;
}

export async function searchMine(tx: Tx, me: StudentCtx, rawQ: string): Promise<SearchDTO> {
  const q = normalizeQuery(rawQ);
  const terms = expandQuery(rawQ);
  const at = now();
  const keys = { studentId: me.studentId, groupId: me.groupId };

  // Дисциплины, преподаватели и аудитории — только из пар студента на ближайшие недели
  // и из его записей на курсы. Пары берём из того же расчёта, что и расписание: перенос уже
  // применён, иначе поиск отправил бы студента на старое время (C11, раунд 1).
  const courseIds = await listMyCourseIds(tx, keys);
  const week = await getMySchedule(tx, keys, {
    from: toMskDate(at),
    to: toMskDate(addDaysMsk(at, HORIZON_DAYS)),
  });
  const upcoming = week.classes;
  const myCourses = await rows<{ id: string; title: string; short_title: string; score: number }>(
    tx,
    sql`
      select c.id, c.title, c.short_title,
        greatest(
          case when lower(replace(c.title,'ё','е')) like any(${arr(terms.map(like))}) then 2 else 0 end,
          case when lower(replace(c.short_title,'ё','е')) like any(${arr(terms.map(like))}) then 2 else 0 end,
          word_similarity(${q}, lower(replace(c.title,'ё','е'))),
          similarity(${q}, lower(replace(c.short_title,'ё','е')))
        ) as score
      from courses c
      where c.id = any(${arr([...new Set([...upcoming.map((u) => u.course.id), ...courseIds])])}::uuid[])
      order by score desc
    `,
  );
  const goodCourses = myCourses.filter((c) => Number(c.score) >= TRGM_MIN + 0.1);
  const goodIds = new Set(goodCourses.map((c) => c.id));

  const schedule: SearchHitDTO[] = [];
  for (const c of goodCourses.slice(0, 2)) {
    schedule.push({
      id: c.id,
      title: c.title,
      hint: "Дисциплина",
      href: `/study/subjects/${c.id}`,
    });
  }
  for (const u of upcoming) {
    if (schedule.length >= LIMIT) break;
    if (!goodIds.has(u.course.id) || Date.parse(u.startsAt) < at.getTime()) continue;
    schedule.push({
      id: u.id,
      title: `${u.course.shortTitle}, ${formatWhen(u.startsAt, at)}`,
      hint: classHint(u, at),
      href: `/schedule?d=${u.startsAt.slice(0, 10)}&class=${u.id}`,
    });
  }

  const sim = (s: string) => {
    const n = normalizeQuery(s);
    return terms.some((t) => n.includes(t)) ? 1 : 0;
  };
  const teacherMap = new Map<string, SearchHitDTO>();
  const roomMap = new Map<string, SearchHitDTO>();
  for (const u of upcoming) {
    if (u.change?.type === "cancelled") continue;
    if (sim(u.teacher.fullName) && !teacherMap.has(u.teacher.id))
      teacherMap.set(u.teacher.id, {
        id: u.teacher.id,
        title: u.teacher.fullName,
        hint: u.course.shortTitle,
        href: `/schedule?d=${u.startsAt.slice(0, 10)}&class=${u.id}`,
      });
    const roomName = `${u.room.building} ${u.room.number}`;
    if ((sim(roomName) || sim(u.room.number)) && !roomMap.has(u.room.id))
      roomMap.set(u.room.id, {
        id: u.room.id,
        title: `Аудитория ${u.room.number}`,
        hint: u.room.building,
        href: `/schedule?d=${u.startsAt.slice(0, 10)}&class=${u.id}`,
      });
  }

  const ann = await listStudentAnnouncements(tx, me, { limit: 50 });
  const announcements: SearchHitDTO[] = ann.items
    .filter((a) => sim(a.title) || sim(a.bodyMd))
    .slice(0, LIMIT)
    .map((a) => ({
      id: a.id,
      title: a.title,
      hint: "Объявление",
      href: `/notifications?tab=announcements#a-${a.id}`,
    }));

  // Свои дедлайны: по названию и дисциплине; сделанные — после активных.
  const deadlineRows = await listDeadlinesForStudent(tx, me.studentId);
  const deadlines: SearchHitDTO[] = deadlineRows
    .filter((r) => sim(r.deadline.title) || (r.courseTitle !== null && sim(r.courseTitle)))
    .sort((a, b) => Number(a.deadline.doneAt !== null) - Number(b.deadline.doneAt !== null))
    .slice(0, LIMIT)
    .map((r) => ({
      id: r.deadline.id,
      title: r.deadline.title,
      hint: [
        r.deadline.doneAt !== null ? "Сделано" : `Срок ${formatWhen(r.deadline.dueAt, at)}`,
        r.courseTitle,
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/study/deadlines#d-${r.deadline.id}`,
    }));

  // Свои заявки: по номеру («СП-2611-0083», «0083») и по названию типа.
  const requestRows = await listRequestsForStudent(tx, me.studentId, {
    statuses: null,
    cursor: null,
    limit: REQUESTS_SCAN,
  });
  const requests: SearchHitDTO[] = requestRows
    .filter((r) => sim(r.request.number) || sim(r.typeTitle))
    .slice(0, LIMIT)
    .map((r) => ({
      id: r.request.id,
      title: `${r.typeTitle} · ${r.request.number}`,
      hint: `${REQUEST_STATUS_HINT[r.request.status]} · подана ${formatDayMonth(r.request.createdAt)}`,
      href: `/requests/${r.request.id}`,
    }));

  const all: SearchGroupDTO[] = [
    { key: "actions", hits: await actions(tx, terms, q) },
    { key: "requests", hits: requests },
    { key: "deadlines", hits: deadlines },
    { key: "schedule", hits: schedule },
    { key: "teachers", hits: [...teacherMap.values()].slice(0, LIMIT) },
    { key: "rooms", hits: [...roomMap.values()].slice(0, LIMIT) },
    { key: "kb", hits: await kb(tx, terms, q) },
    { key: "announcements", hits: announcements },
  ];
  return { q: rawQ, groups: all.filter((g) => g.hits.length > 0) };
}
