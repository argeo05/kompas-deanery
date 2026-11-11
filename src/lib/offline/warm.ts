"use client";

import type { DocumentsDTO, Paged, RequestDTO } from "@/contracts/api";
import { addDays, weekDays } from "@/components/schedule/dates";
import { toMskDate } from "@/lib/time";
import { fetchJson, storeApiData } from "@/lib/use-api";
import { onDeviceWipe } from "./device-data";
import { idb } from "./idb";
import { DOCS_CACHE } from "./policy";

// Подготовка к офлайну (SPEC §6.13, AC-13.1): после входа, когда сеть есть, в фоне сохраняем то,
// что студенту может понадобиться в коридоре без интернета: «Сегодня», расписание на эту и следующую
// неделю, оценки, сессию, заявки, документы (вместе с PDF), уведомления и дедлайны.
// Адреса совпадают с теми, что запрашивают экраны: так экран без сети находит свои данные.

const WARM_KEY = "warmed-at";
const WARM_EVERY_MS = 10 * 60_000;
const MAX_REQUEST_DETAILS = 10;
/** PDF собирается на сервере дорого (и под лимитом): в фоне сохраняем только свежие справки. */
const MAX_DOCUMENTS = 5;

export function offlineUrls(todayIso: string): string[] {
  const thisWeek = weekDays(todayIso);
  const nextWeek = weekDays(addDays(todayIso, 7));
  return [
    "/api/me",
    "/api/me/today",
    `/api/me/schedule?from=${thisWeek[0]}&to=${thisWeek[6]}`,
    `/api/me/schedule?from=${nextWeek[0]}&to=${nextWeek[6]}`,
    "/api/me/grades",
    "/api/me/session",
    "/api/me/requests?tab=active&limit=50",
    "/api/me/documents",
    "/api/me/notifications?tab=all&limit=20",
    "/api/me/deadlines",
    "/api/me/deadlines?status=active",
    "/api/request-types",
  ];
}

async function save<T>(userId: string, url: string): Promise<T | undefined> {
  const res = await fetchJson(url);
  if (!res.ok) return undefined;
  const data = (await res.json()) as T;
  if (data === null || data === undefined) return undefined;
  await storeApiData(userId, url, data);
  return data;
}

/** Через сколько повторить сохранение PDF, если сервер ответил лимитом (окно лимита — минута). */
const DOCS_RETRY_MS = 65_000;
let docsRetry: number | undefined;
// Вышли или вошёл другой человек — отложенная догрузка PDF прошлого пользователя не нужна.
onDeviceWipe(() => window.clearTimeout(docsRetry));

/**
 * Сохранить PDF выданных справок в Cache Storage (его же читает service worker).
 * true — все свежие справки на устройстве.
 */
async function saveDocuments(docs: DocumentsDTO): Promise<boolean> {
  if (!("caches" in window)) return true;
  const cache = await caches.open(DOCS_CACHE);
  for (const d of docs.items.slice(0, MAX_DOCUMENTS)) {
    if (await cache.match(d.fileUrl)) continue;
    const res = await fetch(d.fileUrl, { credentials: "same-origin", cache: "no-store" });
    // Лимит или ошибка — сервер не долбим, остальное догрузим позже.
    if (!res.ok) return false;
    if (res.headers.get("content-type")?.startsWith("application/pdf"))
      await cache.put(d.fileUrl, res);
  }
  return true;
}

/** Не все PDF сохранились (лимит, обрыв) — одна повторная попытка через минуту, пока вкладка открыта. */
function retryDocumentsLater(docs: DocumentsDTO) {
  window.clearTimeout(docsRetry);
  docsRetry = window.setTimeout(() => {
    void saveDocuments(docs).catch(() => undefined);
  }, DOCS_RETRY_MS);
}

/**
 * Работает ли офлайн на этом устройстве: service worker активен (ждём до 30 с — на первом визите он
 * ещё ставится). Без SW (dev, приватный режим, запрет браузера) офлайн-оболочки нет, и копить данные
 * и PDF на устройстве незачем.
 */
export async function offlineCapable(timeoutMs = 30_000): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  const ready = navigator.serviceWorker.ready.then(() => true);
  const timeout = new Promise<boolean>((r) => window.setTimeout(() => r(false), timeoutMs));
  return Promise.race([ready, timeout]);
}

/**
 * Обновить офлайн-набор, если с прошлого раза прошло больше 10 минут (или force).
 * Ошибки не всплывают: это фоновая работа, экран от неё не зависит.
 */
export async function warmOfflineData(userId: string, force = false): Promise<boolean> {
  try {
    const last = await idb.get<number>("meta", WARM_KEY);
    if (!force && last && Date.now() - last < WARM_EVERY_MS) return false;
    if (!(await offlineCapable())) return false;
    const urls = offlineUrls(toMskDate(new Date()));
    const results = await Promise.allSettled(urls.map((u) => save<unknown>(userId, u)));

    const requests = results[urls.indexOf("/api/me/requests?tab=active&limit=50")];
    if (requests?.status === "fulfilled" && requests.value) {
      const items = (requests.value as Paged<RequestDTO>).items.slice(0, MAX_REQUEST_DETAILS);
      await Promise.allSettled(items.map((r) => save(userId, `/api/me/requests/${r.id}`)));
    }
    const docs = results[urls.indexOf("/api/me/documents")];
    if (docs?.status === "fulfilled" && docs.value) {
      const list = docs.value as DocumentsDTO;
      if (!(await saveDocuments(list).catch(() => false))) retryDocumentsLater(list);
    }

    await idb.put("meta", WARM_KEY, Date.now());
    return true;
  } catch {
    return false;
  }
}
