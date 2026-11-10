import "server-only";
import { sql } from "drizzle-orm";
import type { SearchDTO, SearchGroupDTO, SearchHitDTO } from "@/contracts/api";
import { now } from "@/lib/clock";
import { formatWhen } from "@/lib/format";
import { expandQuery, normalizeQuery } from "@/lib/search-synonyms";
import type { StudentCtx } from "../auth/guards";
import type { Tx } from "../db";
import { listMyClasses, listMyCourseIds } from "../repositories/schedule";
import { listStudentAnnouncements } from "./announcements";

// Поиск студента (SPEC §6.10, AC-10.1–10.3). Всё, что возвращается, выбрано из объектов,
// доступных этому студенту: пары — его группы и записей, объявления — через ту же видимость,
// что и лента. Справочники (заявки, справочник) общие. Опечатки — pg_trgm (similarity),
// разговорные слова — словарь синонимов (src/lib/search-synonyms.ts).

const HORIZON_DAYS = 21;
const TRGM_MIN = 0.3;
const LIMIT = 5;

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

export async function searchMine(tx: Tx, me: StudentCtx, rawQ: string): Promise<SearchDTO> {
  const q = normalizeQuery(rawQ);
  const terms = expandQuery(rawQ);
  const at = now();
  const keys = { studentId: me.studentId, groupId: me.groupId };

  // Дисциплины, преподаватели и аудитории — только из пар студента на ближайшие недели
  // и из его записей на курсы.
  const courseIds = await listMyCourseIds(tx, keys);
  const upcoming = await listMyClasses(
    tx,
    keys,
    courseIds,
    new Date(at.getTime() - 24 * 3600_000),
    new Date(at.getTime() + HORIZON_DAYS * 24 * 3600_000),
  );
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
    if (!goodIds.has(u.course.id) || u.row.startsAt.getTime() < at.getTime()) continue;
    schedule.push({
      id: u.row.id,
      title: `${u.course.shortTitle}, ${formatWhen(u.row.startsAt, at)}`,
      hint: `Ауд. ${u.room.number}`,
      href: `/schedule?d=${u.row.startsAt.toISOString().slice(0, 10)}&class=${u.row.id}`,
    });
  }

  const sim = (s: string) => {
    const n = normalizeQuery(s);
    return terms.some((t) => n.includes(t)) ? 1 : 0;
  };
  const teacherMap = new Map<string, SearchHitDTO>();
  const roomMap = new Map<string, SearchHitDTO>();
  for (const u of upcoming) {
    if (sim(u.teacher.fullName) && !teacherMap.has(u.teacher.id))
      teacherMap.set(u.teacher.id, {
        id: u.teacher.id,
        title: u.teacher.fullName,
        hint: u.course.shortTitle,
        href: `/schedule?d=${u.row.startsAt.toISOString().slice(0, 10)}&class=${u.row.id}`,
      });
    const roomName = `${u.room.building} ${u.room.number}`;
    if ((sim(roomName) || sim(u.room.number)) && !roomMap.has(u.room.id))
      roomMap.set(u.room.id, {
        id: u.room.id,
        title: `Аудитория ${u.room.number}`,
        hint: u.room.building,
        href: `/schedule?d=${u.row.startsAt.toISOString().slice(0, 10)}&class=${u.row.id}`,
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

  const all: SearchGroupDTO[] = [
    { key: "actions", hits: await actions(tx, terms, q) },
    { key: "schedule", hits: schedule },
    { key: "teachers", hits: [...teacherMap.values()].slice(0, LIMIT) },
    { key: "rooms", hits: [...roomMap.values()].slice(0, LIMIT) },
    { key: "kb", hits: await kb(tx, terms, q) },
    { key: "announcements", hits: announcements },
  ];
  return { q: rawQ, groups: all.filter((g) => g.hits.length > 0) };
}
