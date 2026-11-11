/// <reference lib="webworker" />
import {
  CacheFirst,
  CacheableResponsePlugin,
  ExpirationPlugin,
  NetworkOnly,
  Serwist,
  type PrecacheEntry,
} from "serwist";
import { DOCS_CACHE, isDocumentFileUrl } from "../lib/offline/policy";
import { flushOutboxFromWorker } from "../lib/offline/outbox-worker";

// Service worker Компаса (SPEC §6.13, D-014). Собирается scripts/build-sw.mjs в public/sw.js.
//
// Что где хранится:
// • оболочка (JS, CSS, шрифты, иконки, страница /offline без личных данных) — precache;
// • HTML страниц кабинета НЕ кэшируется никогда: навигация идёт в сеть, без сети отдаём /offline,
//   а она рисует экран из данных в IndexedDB текущего пользователя (src/lib/offline);
// • данные API кэширует сам экран в IndexedDB с меткой времени (stale-while-revalidate в useApi):
//   там же привязка к пользователю и очистка при выходе. SW их не трогает;
// • PDF выданных справок — Cache Storage «kompas-docs», CacheFirst (документ не меняется после выдачи).

declare const self: ServiceWorkerGlobalScope;
declare const __KOMPAS_PRECACHE__: (PrecacheEntry | string)[];

const serwist = new Serwist({
  precacheEntries: __KOMPAS_PRECACHE__,
  precacheOptions: { cleanupOutdatedCaches: true, concurrency: 8 },
  // Новая версия ждёт, пока пользователь не нажмёт «Обновить» в тосте (без перезагрузки посреди действия).
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
  disableDevLogs: true,
  runtimeCaching: [
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && isDocumentFileUrl(url.pathname),
      handler: new CacheFirst({
        cacheName: DOCS_CACHE,
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 180 * 24 * 3600 }),
        ],
      }),
    },
    {
      // Страницы — только из сети. Ошибка сети → запасная /offline (fallbacks ниже).
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkOnly(),
    },
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.mode === "navigate" }],
  },
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

// Background Sync (Chrome на Android): очередь офлайн-действий уходит, даже если вкладка закрыта.
// Открытая вкладка отправит очередь сама — тогда фоновая отправка ей не мешает (общий Web Lock).
interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
}
self.addEventListener("sync", ((event: SyncEvent) => {
  if (event.tag === "kompas-outbox") event.waitUntil(flushOutboxFromWorker());
}) as EventListener);

serwist.addEventListeners();
