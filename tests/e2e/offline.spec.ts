import { expect, test, type Browser, type Page } from "@playwright/test";
import type { DocumentsDTO, Paged, RequestDetailDTO, RequestDTO } from "../../src/contracts/api";
import { loginAs, DEMO } from "./support/auth";

// C7: PWA и офлайн (SPEC §6.13, AC-13.1–13.4, D-014). Сервер — production-сборка с service worker.
// Офлайн — context.setOffline(true): запросы страницы и service worker падают, как в режиме полёта.

/** Имя Ани отдельным словом (getByText ищет подстроку: «сохранялся» тоже содержит «аня»). */
const ANNA = /(^|[\s,])Аня([\s,!.]|$)/;
const MAXIM = /(^|[\s,])Максим([\s,!.]|$)/;

/** Значение из IndexedDB «kompas» (страница уже на сайте). */
async function idbGet(page: Page, store: string, key: string): Promise<unknown> {
  return page.evaluate(
    ([s, k]) =>
      new Promise((resolve) => {
        const req = indexedDB.open("kompas");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(s)) return resolve(undefined);
          const get = db.transaction(s).objectStore(s).get(k);
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => resolve(undefined);
        };
        req.onerror = () => resolve(undefined);
      }),
    [store, key] as const,
  );
}

/** Все ключи хранилища IndexedDB. */
async function idbKeys(page: Page, store: string): Promise<string[]> {
  return page.evaluate(
    (s) =>
      new Promise<string[]>((resolve) => {
        const req = indexedDB.open("kompas");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(s)) return resolve([]);
          const get = db.transaction(s).objectStore(s).getAllKeys();
          get.onsuccess = () => resolve(get.result.map(String));
          get.onerror = () => resolve([]);
        };
        req.onerror = () => resolve([]);
      }),
    store,
  );
}

/** Service worker управляет страницей, офлайн-набор данных сохранён. */
async function waitOfflineReady(page: Page) {
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      timeout: 20_000,
    })
    .toBe(true);
  await expect.poll(() => idbGet(page, "meta", "warmed-at"), { timeout: 20_000 }).toBeTruthy();
}

async function onlineStudent(browser: Browser, baseURL: string, who: keyof typeof DEMO = "anna") {
  const ctx = await browser.newContext({ baseURL, serviceWorkers: "allow" });
  await loginAs(ctx, who, baseURL);
  const page = await ctx.newPage();
  await page.goto("/today");
  await waitOfflineReady(page);
  return { ctx, page };
}

async function openSignOut(page: Page) {
  const side = page.getByRole("button", { name: "Выйти", exact: true });
  if (!(await side.isVisible())) await page.getByRole("button", { name: /^Ещё/ }).click();
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
}

test("AC-13.1: без сети открываются «Сегодня», расписание на 2 недели, учёба, заявки и PDF", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ baseURL, serviceWorkers: "allow" });
  const staff = await browser.newContext({ baseURL });
  await loginAs(ctx, "anna", baseURL!);
  await loginAs(staff, "elena", baseURL!);
  const request = await ctx.request.post("/api/me/requests", {
    data: {
      typeCode: "study_cert",
      delivery: "electronic",
      copies: 1,
      fields: { destination: "В банк" },
    },
    headers: { origin: baseURL!, "idempotency-key": crypto.randomUUID() },
  });
  expect(request.status(), await request.text()).toBe(201);
  const { id } = (await request.json()) as RequestDTO;
  for (const action of ["take", "ready", "issue"]) {
    const response = await staff.request.post(`/api/staff/requests/${id}/transition`, {
      data: { action },
      headers: { origin: baseURL! },
    });
    expect(response.status(), await response.text()).toBe(200);
  }
  await staff.close();

  const page = await ctx.newPage();
  await page.goto("/today");
  await waitOfflineReady(page);
  const docs = (await (await ctx.request.get("/api/me/documents")).json()) as DocumentsDTO;
  const document = docs.items.find((item) => item.requestId === id);
  expect(document, "у Ани есть выданная справка по тестовой заявке").toBeDefined();
  const { fileUrl } = document!;
  // Фоновая подготовка кладёт PDF в Cache Storage.
  await expect
    .poll(
      () =>
        page.evaluate(
          async (url) => (await (await caches.open("kompas-docs")).match(url)) !== undefined,
          fileUrl,
        ),
      // Параллельные тесты Ани упираются в лимит PDF (20 в минуту): подготовка повторит через минуту.
      { timeout: 80_000 },
    )
    .toBe(true);

  await ctx.setOffline(true);

  const res = await page.goto("/today");
  // Страницу отдал service worker: это офлайн-оболочка /offline, а не сохранённый HTML кабинета.
  expect(res?.fromServiceWorker()).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: /, Аня$/ })).toBeVisible();
  await expect(page.locator("[data-slot=offline-bar]")).toContainText(
    "Нет сети · показаны данные от",
  );
  await expect(page.getByTestId("data-freshness").first()).toContainText("обновлено");

  await page.goto("/schedule");
  await expect(page.getByRole("heading", { level: 1, name: "Расписание" })).toBeVisible();
  await expect(page.getByText("Неделя", { exact: false }).first()).toBeVisible();
  // Следующая неделя тоже сохранена (SPEC §6.3 п.9).
  const nextMonday = await page.evaluate(() => {
    const d = new Date(Date.now() + 3 * 3600_000);
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day + 7);
    return d.toISOString().slice(0, 10);
  });
  await page.goto(`/schedule?d=${nextMonday}`);
  await expect(page.getByRole("heading", { level: 1, name: "Расписание" })).toBeVisible();
  await expect(page.getByText("Нет сети", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("data-freshness").first()).toBeVisible();

  await page.goto("/study");
  await expect(page.getByRole("heading", { level: 1, name: "Учёба" })).toBeVisible();
  await expect(page.getByTestId("data-freshness").first()).toBeVisible();

  await page.goto("/requests");
  await expect(page.getByRole("heading", { level: 1, name: "Заявки" })).toBeVisible();
  await expect(page.getByTestId("request-row").first()).toBeVisible();

  await page.goto("/documents");
  const row = page.getByTestId("document-row").filter({
    has: page.locator(`a[href="/requests/${id}"]`),
  });
  await expect(row).toBeVisible();
  await expect(row.getByTestId("saved-offline")).toBeVisible();
  const pdf = await page.evaluate(async (url) => {
    const r = await fetch(url);
    const bytes = new Uint8Array(await r.arrayBuffer());
    return {
      status: r.status,
      type: r.headers.get("content-type"),
      head: String.fromCharCode(...bytes.slice(0, 5)),
    };
  }, fileUrl);
  expect(pdf).toEqual({ status: 200, type: "application/pdf", head: "%PDF-" });
  const download = page.waitForEvent("download");
  await row.getByRole("link", { name: "Скачать PDF" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);

  // Раздел без офлайна — честное сообщение, а не белый экран.
  await page.goto("/search");
  await expect(
    page.getByRole("heading", { level: 1, name: /без сети не открывается/ }),
  ).toBeVisible();

  await ctx.close();
});

test("SW не кэширует HTML кабинета; HTML отдаётся с no-store", async ({ browser, baseURL }) => {
  const { ctx, page } = await onlineStudent(browser, baseURL!, "maxim");
  const res = await ctx.request.get("/today");
  expect(res.headers()["cache-control"]).toContain("no-store");

  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys())
        urls.push(new URL(req.url).pathname);
    }
    return urls;
  });
  const pages = cached.filter(
    (p) =>
      !p.startsWith("/_next/static/") &&
      !p.startsWith("/icons/") &&
      !p.startsWith("/api/me/documents/") &&
      p !== "/manifest.webmanifest",
  );
  // Единственная страница в кэше — публичная оболочка без личных данных.
  expect(pages).toEqual(["/offline"]);
  await ctx.close();
});

test("AC-13.2: приложение устанавливается (манифест, иконки, service worker)", async ({
  browser,
  baseURL,
}) => {
  const { ctx, page } = await onlineStudent(browser, baseURL!, "maxim");
  const manifest = await (await ctx.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({
    display: "standalone",
    start_url: "/today",
    short_name: "Компас",
  });
  const sizes = manifest.icons.map(
    (i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`,
  );
  expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
  for (const icon of manifest.icons) expect((await ctx.request.get(icon.src)).status()).toBe(200);

  // Те же проверки, что у Lighthouse и у Chrome перед кнопкой «Установить».
  const cdp = await ctx.newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  expect(installabilityErrors).toEqual([]);
  await ctx.close();
});

test("AC-13.3: заявка без сети уходит ровно один раз, когда сеть вернулась", async ({
  browser,
  baseURL,
}, testInfo) => {
  const { ctx, page } = await onlineStudent(browser, baseURL!, "maxim");
  const destination = `офлайн ${testInfo.project.name} ${Date.now()}`;

  await ctx.setOffline(true);
  await page.goto("/requests/new");
  await page.getByRole("link", { name: "Справка об обучении" }).first().click();
  await page.getByLabel("Куда предоставляется справка").fill(destination);
  await page.getByRole("radio", { name: /Электронно/ }).check();
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(page.getByTestId("request-queued")).toContainText("Ожидает отправки");

  await page.getByRole("link", { name: "К заявкам" }).click();
  const queued = page.getByTestId("queued-request");
  await expect(queued).toContainText("Справка об обучении");
  await expect(queued).toContainText("Ожидает отправки");
  await expect(page.locator("[data-slot=offline-bar]")).toContainText("1 действие ждёт отправки");

  await ctx.setOffline(false);
  // Событие online → очередь уходит, карточка «Ждут отправки» исчезает, список обновляется.
  await expect(queued).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByText("Отправили то, что ждало сети")).toBeVisible();

  // Ещё одно открытие кабинета снова запускает отправку очереди — дубля быть не должно.
  await page.goto("/today");
  await page.goto("/requests");
  const list = (await (
    await ctx.request.get("/api/me/requests?tab=active&limit=50")
  ).json()) as Paged<RequestDTO>;
  const details = await Promise.all(
    list.items.map(
      async (r) =>
        (await (await ctx.request.get(`/api/me/requests/${r.id}`)).json()) as RequestDetailDTO,
    ),
  );
  const mine = details.filter((d) => Object.values(d.fields).includes(destination));
  expect(mine).toHaveLength(1);
  await ctx.close();
});

test("AC-13.4: выход без сети стирает данные, другой человек не видит прошлого", async ({
  browser,
  baseURL,
}) => {
  // Максим, а не Аня: у Ани много справок, а лимит PDF (20 в минуту) общий для параллельных тестов.
  const { ctx, page } = await onlineStudent(browser, baseURL!, "maxim");
  const maxim = (await idbGet(page, "meta", "user")) as { userId: string };
  expect((await idbKeys(page, "data")).some((k) => k.startsWith(`${maxim.userId}|`))).toBe(true);
  // Копия PDF на устройстве (как после скачивания справки) — при выходе она тоже стирается.
  await page.evaluate(async () =>
    (await caches.open("kompas-docs")).put("/e2e-doc.pdf", new Response("%PDF-")),
  );

  await ctx.setOffline(true);
  await openSignOut(page);
  await expect(page.getByRole("heading", { level: 1, name: "Вы вышли из Компаса" })).toBeVisible();
  expect(await idbKeys(page, "data")).toEqual([]);
  expect(await page.evaluate(() => caches.has("kompas-docs"))).toBe(false);

  // Без сети ни один раздел кабинета не показывает данные Максима.
  for (const path of ["/today", "/schedule", "/documents"]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { level: 1, name: "Вы вышли из Компаса" }),
    ).toBeVisible();
    await expect(page.getByText(MAXIM)).toHaveCount(0);
  }

  // Сеть вернулась — выход завершается и на сервере: cookie больше не пускает в кабинет.
  await ctx.setOffline(false);
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  expect((await ctx.request.get("/api/me")).status()).toBe(401);
  await ctx.close();
});

test("AC-13.4: вошёл другой человек — данные прошлого стёрты", async ({ browser, baseURL }) => {
  const { ctx, page } = await onlineStudent(browser, baseURL!);
  const anna = (await idbGet(page, "meta", "user")) as { userId: string };

  // На том же устройстве входит Максим (без явного выхода Ани).
  await loginAs(ctx, "maxim", baseURL!);
  await page.goto("/today");
  await expect
    .poll(
      async () => ((await idbGet(page, "meta", "user")) as { userId: string } | undefined)?.userId,
    )
    .not.toBe(anna.userId);
  await expect.poll(() => idbGet(page, "meta", "warmed-at"), { timeout: 20_000 }).toBeTruthy();
  const keys = await idbKeys(page, "data");
  expect(keys.filter((k) => k.startsWith(`${anna.userId}|`))).toEqual([]);

  await ctx.setOffline(true);
  await page.goto("/today");
  await expect(page.getByRole("heading", { level: 1, name: /Максим$/ })).toBeVisible();
  await expect(page.getByText(ANNA)).toHaveCount(0);
  await ctx.close();
});

test("AC-13.4: вошёл сотрудник — данные студента стёрты, офлайн их не покажет", async ({
  browser,
  baseURL,
}) => {
  const { ctx, page } = await onlineStudent(browser, baseURL!, "maxim");
  await loginAs(ctx, "elena", baseURL!);
  await page.goto("/staff/queue");
  await expect.poll(() => idbKeys(page, "data")).toEqual([]);
  expect(await idbGet(page, "meta", "user")).toBeUndefined();

  await ctx.setOffline(true);
  await page.goto("/today");
  await expect(page.getByRole("heading", { level: 1, name: "Нет сети" })).toBeVisible();
  await expect(page.getByText(MAXIM)).toHaveCount(0);
  await ctx.close();
});
