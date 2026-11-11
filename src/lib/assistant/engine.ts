import { SYNONYMS } from "@/lib/search-synonyms";

// Помощник «Спросить Компас» без ИИ-провайдера (SPEC §6.8.2, AC-8.1, AC-8.3): детерминированный
// поиск по справочнику. Чистая функция без обращений к сети и БД: один и тот же вопрос даёт один и тот же ответ,
// поэтому eval воспроизводим. Тот же результат — «запасной» ответ, когда ИИ недоступен.

export interface KbDoc {
  slug: string;
  title: string;
  tags: string[];
  bodyMd: string;
}

export interface SourceRef {
  slug: string;
  title: string;
  /** Раздел статьи, из которого взят текст (для первой ссылки). */
  section: string | null;
}

export type Verdict =
  | { kind: "answer"; text: string; sources: SourceRef[]; context: KbDoc[] }
  | { kind: "not_found" }
  | { kind: "refused"; reason: RefusalReason };

export type RefusalReason = "injection" | "foreign_data" | "promise";

export const MAX_ANSWER_WORDS = 120;
export const MAX_QUESTION_CHARS = 500;

// NFKC и удаление невидимых и комбинируемых знаков: «игно\u200Bрируй» не обходит фильтр провокаций.
const norm = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/[\p{Cf}\p{Mn}]/gu, "")
    .toLowerCase()
    .replaceAll("ё", "е");

// ── Отказы на провокации ────────────────────────────────────────────────────

const INJECTION: RegExp[] = [
  /(игнорир|забудь|отмени|отключи|обойди|сбрось)[а-яa-z0-9]*\s+(все\s+|любые\s+|свои\s+|эти\s+|предыдущ[а-яa-z0-9]+\s+|прежн[а-яa-z0-9]+\s+)*(инструкц|правил|ограничен|запрет|указани)/,
  /(системн[а-яa-z0-9]+\s+(промпт|подсказк|инструкц)|system\s*prompt|твои\s+инструкц|твой\s+промпт|свои\s+инструкц)/,
  /(ты\s+теперь|притворись|представь,?\s+что\s+ты|веди\s+себя\s+как|роль\s+без\s+ограничен|режим\s+(разработчик|бога)|jailbreak|dan(?![а-яa-z0-9]))/,
  /(api[\s_-]*ключ|секретн[а-яa-z0-9]*\s+ключ|переменн[а-яa-z0-9]+\s+окружен|(назови|покажи|выдай|дай|скажи|выведи|пришли)\s+[а-яa-z0-9\s]{0,30}(парол|токен|ключ))/,
  /(выполни|запусти)\s+(команд|код|скрипт|sql)|(?<![а-яa-z0-9])sql(?![а-яa-z0-9])|drop\s+table|<script/,
  /(ignore|disregard)\s+(all\s+|previous\s+|the\s+)*(instructions|rules)/,
];

const PERSONAL_WORDS =
  "(оценк|балл|успеваемост|расписан|заявк|справк|паспорт|телефон|адрес|почт|email|данн|долг|стипенд|диагноз|обращени|личн[а-яa-z0-9]+\\s+дел)";
const OTHERS =
  "(друг[а-яa-z0-9]+\\s+студент|чуж[а-яa-z0-9]+|одногруппник|сосед[а-яa-z0-9]*|одноклассник|всех\\s+студент|всем\\s+студент|студент[а-яa-z0-9]*\\s+[а-яa-z]+\\s+[а-яa-z]+|любого\\s+студент)";

function foreignData(original: string, q: string): boolean {
  if (new RegExp(`${PERSONAL_WORDS}[а-яa-z0-9]*\\s+(у\\s+|для\\s+|от\\s+)?${OTHERS}`).test(q))
    return true;
  if (new RegExp(`${OTHERS}.{0,40}${PERSONAL_WORDS}`).test(q)) return true;
  if (/список[а-яa-z0-9]*\s+(всех\s+)?студент|базу\s+студент|все\s+студенты/.test(q)) return true;
  // «оценки Максима», «расписание у Ольги»: личные данные + имя с заглавной буквы.
  const names = [...original.matchAll(/(?:^|[\s«"(])([А-ЯЁ][а-яё]{2,})/g)]
    .map((m) => m[1]!)
    .filter((w, i, all) => !(i === 0 && all.length > 0 && original.trimStart().startsWith(w)))
    .filter((w) => !/^(Компас|Москва|Google|Яндекс|Wi|Мои|Мой|Моя)$/i.test(w));
  return names.length > 0 && new RegExp(PERSONAL_WORDS).test(q);
}

const PROMISE =
  /(пообещай|гарантируй[а-яa-z0-9]*|скажи,?\s+что\s+(мне\s+)?(точно|обязательно)|мне\s+точно\s+(дадут|одобрят|поставят|восстановят|переведут)|обещаешь|подтверди,?\s+что\s+(мне\s+)?(точно|обязательно))/;

export function detectRefusal(question: string): RefusalReason | null {
  const q = norm(question);
  if (INJECTION.some((re) => re.test(q))) return "injection";
  if (foreignData(question, q)) return "foreign_data";
  if (PROMISE.test(q)) return "promise";
  return null;
}

// ── Поиск по справочнику ────────────────────────────────────────────────────

const STOP = new Set(
  `как что где когда куда зачем почему можно нужно надо ли или это эти этот эта для при про над под без так там тут
  мне меня мой моя мои моё мою нам наш вас вам ваш вы мы они она оно его они них ему ней есть быть был была были будет
  хочу хотел хотела могу можете сколько какой какая какие какое каким какую который которая которые уже ещё еще только
  если чтобы чтоб тоже также очень просто пожалуйста подскажите подскажи скажите скажи расскажи расскажите объясни
  объясните дайте дай нужна нужен нужны вообще именно после перед между через чем кто кого чего чему всё все всех
  вот ну да нет взять начать вопрос свой своему своего своих учиться не ни же бы ещё надо делать сделать можно получить сделаю`
    .split(/\s+/)
    .filter(Boolean),
);

/** Грубый стемминг по префиксу: падежи и суффиксы русского слова отбрасываются. */
function stem(word: string): string {
  return word.length > 5 ? word.slice(0, 5) : word;
}

/** Основы служебных вопросительных глаголов («бывают», «существуют», «делают»): сами по себе ничего не ищут. */
const STOP_STEMS = new Set([
  "бываю",
  "бывае",
  "сущес",
  "делаю",
  "делае",
  "значи",
  "прочи",
  "подск",
  "расск",
  "униве",
]);

function tokens(text: string): string[] {
  return (
    norm(text)
      .replace(/wi-?fi/g, "wifi")
      .match(/[а-яa-z0-9]+/g) ?? []
  ).filter((w) => w.length >= 3 && !STOP.has(w) && !STOP_STEMS.has(stem(w)));
}

/** Основы вопроса с расширением разговорных слов (общага → общежитие). */
export function queryStems(question: string): string[] {
  const out = new Set<string>();
  for (const w of tokens(question)) {
    out.add(stem(w));
    for (const [key, values] of Object.entries(SYNONYMS)) {
      if (norm(key) === w) for (const v of values) for (const t of tokens(v)) out.add(stem(t));
    }
  }
  return [...out];
}

interface Indexed {
  doc: KbDoc;
  title: Set<string>;
  tags: Set<string>;
  body: Set<string>;
  /** Сколько раз основа встречается в тексте статьи. */
  freq: Map<string, number>;
}

function index(docs: KbDoc[]): Indexed[] {
  return docs.map((doc) => {
    const freq = new Map<string, number>();
    for (const w of tokens(doc.bodyMd)) freq.set(stem(w), (freq.get(stem(w)) ?? 0) + 1);
    return {
      doc,
      freq,
      title: new Set(tokens(doc.title).map(stem)),
      tags: new Set(doc.tags.flatMap(tokens).map(stem)),
      body: new Set(tokens(doc.bodyMd).map(stem)),
    };
  });
}

const MIN_COVERAGE = 0.4;
const MIN_SCORE = 2.5;

interface Ranked {
  item: Indexed;
  score: number;
}

export function rank(
  question: string,
  docs: KbDoc[],
): { ranked: Ranked[]; coverage: number; named: boolean } {
  const stems = queryStems(question);
  const idx = index(docs);
  if (stems.length === 0 || idx.length === 0) return { ranked: [], coverage: 0, named: false };
  const df = new Map<string, number>();
  for (const s of stems)
    df.set(s, idx.filter((i) => i.title.has(s) || i.tags.has(s) || i.body.has(s)).length);
  const idf = (s: string) => Math.log(1 + idx.length / (1 + (df.get(s) ?? 0)));
  const ranked = idx
    .map((item) => ({
      item,
      score: stems.reduce(
        (sum, s) =>
          sum +
          idf(s) * (item.title.has(s) ? 3 : item.tags.has(s) ? 2 : item.body.has(s) ? 1 : 0) +
          // Частота в тексте разводит статьи с одинаковым совпадением в заголовке.
          0.2 * idf(s) * Math.log(1 + (item.freq.get(s) ?? 0)),
        0,
      ),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.item.doc.slug.localeCompare(b.item.doc.slug));
  const total = stems.reduce((sum, s) => sum + idf(s), 0);
  const top = ranked[0];
  const covered = top
    ? stems.reduce(
        (sum, s) =>
          sum +
          (top.item.title.has(s) || top.item.tags.has(s) || top.item.body.has(s) ? idf(s) : 0),
        0,
      )
    : 0;
  // Тема названа: хотя бы одно слово вопроса стоит в заголовке или тегах лучшей статьи.
  const named = !!top && stems.some((s) => top.item.title.has(s) || top.item.tags.has(s));
  return { ranked, coverage: total === 0 ? 0 : covered / total, named };
}

// ── Извлечение ответа ───────────────────────────────────────────────────────

interface Section {
  heading: string | null;
  lines: string[];
}

function plain(line: string): string {
  return line
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sections(bodyMd: string): Section[] {
  const out: Section[] = [{ heading: null, lines: [] }];
  for (const raw of bodyMd.split("\n")) {
    const h = /^#{2,3}\s+(.*)$/.exec(raw);
    if (h) out.push({ heading: plain(h[1]!), lines: [] });
    else if (plain(raw)) out[out.length - 1]!.lines.push(raw.trim());
  }
  return out.filter((s) => s.lines.length > 0);
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Сколько слов вмещается в ответ: строки целиком, лишнее обрезается по границе предложения. */
function clip(lines: string[], limit: number): string {
  const out: string[] = [];
  let used = 0;
  for (const raw of lines) {
    const line = plain(
      raw.replace(/^\s*(?:[-*]|\d+\.)\s+/, (m) => (/\d/.test(m) ? m.trim() + " " : "• ")),
    );
    const n = words(line);
    if (used + n <= limit) {
      out.push(line);
      used += n;
      continue;
    }
    const room = limit - used;
    if (room >= 8) {
      const cut = line.split(/\s+/).slice(0, room).join(" ");
      const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
      out.push(end > 0 ? cut.slice(0, end + 1) : `${cut}…`);
    }
    break;
  }
  return out.join("\n");
}

function extract(doc: KbDoc, stems: string[]): { text: string; section: string | null } {
  const secs = sections(doc.bodyMd).filter(
    (s) => !/вымышленные правила для демонстрации/i.test(s.lines.join(" ")) || s.lines.length > 1,
  );
  const scored = secs.map((s) => {
    const own = new Set(tokens(`${s.heading ?? ""} ${s.lines.join(" ")}`).map(stem));
    const head = new Set(tokens(s.heading ?? "").map(stem));
    return {
      s,
      score: stems.reduce((n, st) => n + (head.has(st) ? 2 : own.has(st) ? 1 : 0), 0),
    };
  });
  // Сначала содержательные разделы: вводная часть без заголовка берётся, только если ничего не нашлось.
  const withHeading = scored.filter((x) => x.s.heading !== null);
  const pool = withHeading.length > 0 ? withHeading : scored;
  const best = pool.reduce((a, b) => (b.score > a.score ? b : a), pool[0]!);
  const lines = best.s.lines.filter((l) => !/^_?вымышленные правила/i.test(plain(l)));
  return { text: clip(lines, MAX_ANSWER_WORDS), section: best.s.heading };
}

// ── Точка входа ─────────────────────────────────────────────────────────────

/** Ответ по справочнику. Провокации и вопросы вне справочника отсекаются здесь, до любого ИИ. */
export function answerFromKb(question: string, docs: KbDoc[]): Verdict {
  const refusal = detectRefusal(question);
  if (refusal) return { kind: "refused", reason: refusal };
  const { ranked, coverage, named } = rank(question, docs);
  const top = ranked[0];
  // Совпадение только в тексте статьи, без названной темы, считаем случайным («завтра» в «Уведомлениях»).
  if (!top || coverage < MIN_COVERAGE || top.score < MIN_SCORE || (!named && coverage < 0.7))
    return { kind: "not_found" };
  const { text, section } = extract(top.item.doc, queryStems(question));
  if (!text) return { kind: "not_found" };
  const near = ranked.slice(0, 3).filter((r, i) => i === 0 || r.score >= top.score * 0.6);
  return {
    kind: "answer",
    text,
    sources: near.map((r, i) => ({
      slug: r.item.doc.slug,
      title: r.item.doc.title,
      section: i === 0 ? section : null,
    })),
    context: near.map((r) => r.item.doc),
  };
}
