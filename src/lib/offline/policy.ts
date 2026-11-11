// Что Компас хранит на устройстве для офлайна (SPEC §6.13, D-014). Общий модуль для страниц и SW.

/** Cache Storage для PDF выданных справок. */
export const DOCS_CACHE = "kompas-docs";

/** Адрес PDF выданной справки: /api/me/documents/<uuid>/file. */
export function isDocumentFileUrl(pathname: string): boolean {
  return /^\/api\/me\/documents\/[0-9a-f-]{36}\/file$/i.test(pathname);
}

// Ответы API, которые экран сохраняет в IndexedDB (stale-while-revalidate с меткой времени).
// Только данные студента: поиск, ICS-ссылка и кабинет сотрудника на устройстве не оседают.
const PERSISTED: RegExp[] = [
  /^\/api\/me$/,
  /^\/api\/me\/today$/,
  /^\/api\/me\/schedule\?/,
  /^\/api\/me\/grades(\/[^/?]+)?(\?.*)?$/,
  /^\/api\/me\/session$/,
  /^\/api\/me\/requests(\?.*)?$/,
  /^\/api\/me\/requests\/[0-9a-f-]{36}$/i,
  /^\/api\/me\/documents$/,
  /^\/api\/me\/notifications\?/,
  /^\/api\/me\/announcements\?/,
  /^\/api\/me\/deadlines(\?.*)?$/,
  /^\/api\/me\/tickets(\/[0-9a-f-]{36})?$/i,
  /^\/api\/request-types$/,
];

/** Сохранять ли ответ GET на устройстве. Остальное живёт только в памяти вкладки. */
export function isPersistable(url: string): boolean {
  return PERSISTED.some((re) => re.test(url));
}

/** Сколько хранить данные на устройстве: дальше они скорее вредят, чем помогают. */
export const DATA_MAX_AGE_MS = 30 * 24 * 3600_000;

/** Разделы кабинета, которые открываются без сети (SPEC §6.13, AC-13.1). */
export const OFFLINE_SECTIONS = [
  "/today",
  "/schedule",
  "/study",
  "/requests",
  "/documents",
  "/notifications",
  "/support",
] as const;
