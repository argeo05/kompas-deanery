import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "../e2e/support/auth";

// WCAG 2.2 AA в офлайне (C7, SPEC §6.13): офлайн-оболочка рисует кабинет из данных устройства,
// плашка «Нет сети», метки «Ожидает отправки», экран «Вы вышли». Нужен service worker.
test.use({ serviceWorkers: "allow" });

async function axe(page: Page) {
  await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
  await page.waitForTimeout(600);
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target).join(", ")}`),
  ).toEqual([]);
}

async function offlineReady(page: Page) {
  await page.goto("/today");
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      timeout: 20_000,
    })
    .toBe(true);
  // Офлайн-набор сохранён (метка в IndexedDB ставится последней).
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise((resolve) => {
              const req = indexedDB.open("kompas");
              req.onsuccess = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains("meta")) return resolve(false);
                const get = db.transaction("meta").objectStore("meta").get("warmed-at");
                get.onsuccess = () => resolve(Boolean(get.result));
                get.onerror = () => resolve(false);
              };
              req.onerror = () => resolve(false);
            }),
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test(`axe: офлайн «Сегодня», расписание и заявка в очереди (${scheme})`, async ({
      page,
      context,
      baseURL,
    }) => {
      await loginAs(context, "maxim", baseURL!);
      await offlineReady(page);
      await context.setOffline(true);

      for (const path of ["/today", "/schedule", "/documents"]) {
        await page.goto(path);
        await expect(page.locator("[data-slot=offline-bar]")).toBeVisible();
        await axe(page);
      }

      // Заявка без сети: экран «будет отправлена» и карточка «Ожидает отправки» в списке.
      // Контекст закрывается без сети — заявка на сервер не уходит.
      await page.goto("/requests/new/study_cert");
      await page.getByLabel("Куда предоставляется справка").fill("axe офлайн");
      await page.getByRole("radio", { name: /Электронно/ }).check();
      await page.getByRole("button", { name: "Отправить" }).click();
      await expect(page.getByTestId("request-queued")).toBeVisible();
      await axe(page);
      await page.getByRole("link", { name: "К заявкам" }).click();
      await expect(page.getByTestId("queued-request")).toBeVisible();
      await axe(page);
    });

    test(`axe: «Вы вышли» и раздел без офлайна (${scheme})`, async ({ page, context, baseURL }) => {
      await loginAs(context, "maxim", baseURL!);
      await offlineReady(page);
      await context.setOffline(true);
      await page.goto("/search");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("без сети");
      await axe(page);

      await page.goto("/today");
      const side = page.getByRole("button", { name: "Выйти", exact: true });
      if (!(await side.isVisible())) await page.getByRole("button", { name: /^Ещё/ }).click();
      await page.getByRole("button", { name: "Выйти", exact: true }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Вы вышли из Компаса" }),
      ).toBeVisible();
      await axe(page);
    });
  });
}
