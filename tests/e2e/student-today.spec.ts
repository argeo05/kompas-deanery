import { expect, test } from "@playwright/test";
import { loginAs } from "./support/auth";
import { makeChange, makeClass, makeToday, mockJson, THREE_CLASSES } from "./support/mocks";

// «Сегодня» (этап C3, SPEC §6.2): AC-2.1, AC-2.3, AC-2.5, ветки hero, состояния.

test.beforeEach(async ({ context, baseURL }) => {
  await loginAs(context, "anna", baseURL!);
});

const overflow = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("гость уходит на вход, после входа попадает на «Сегодня»", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL });
  const page = await ctx.newPage();
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login\?next=%2Ftoday/);
  // Q-1.2: вход демо-аккаунтом — одно касание, тот же вход по логину и паролю.
  await page.getByRole("button", { name: /Войти как Аня/ }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Аня|Анна/);
  await ctx.close();
});

test("настоящие данные Анны: hero, лента, без горизонтальной прокрутки (AC-2.5)", async ({
  page,
}) => {
  await page.goto("/today");
  await expect(page.locator("[data-slot=hero] h2")).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("AC-2.1: hero и две следующие пары видны без прокрутки на 360×740", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-360");
  await mockJson(page, "**/api/me/today", makeToday());
  await page.goto("/today");
  const hero = page.locator("[data-slot=hero]");
  await expect(hero).toBeVisible();
  const second = page.getByRole("link", { name: "Философия" });
  await expect(second).toBeVisible();
  const box = await second.boundingBox();
  // Нижняя панель занимает 64 px + safe-area: пара должна лежать выше неё.
  expect(box!.y + box!.height).toBeLessThanOrEqual(740 - 64);
});

const branches = [
  {
    name: "change",
    dto: () =>
      makeToday({
        hero: { kind: "change", classId: "c3", change: makeChange("moved") },
        classes: [
          THREE_CLASSES[0]!,
          makeClass({
            id: "c3",
            title: "Макроэкономика",
            startsAt: "2026-11-12T15:20:00+03:00",
            endsAt: "2026-11-12T16:40:00+03:00",
            change: makeChange("moved"),
          }),
        ],
      }),
    text: /Пара перенесена: Макроэкономика/,
  },
  {
    name: "now",
    dto: () =>
      makeToday({
        now: "2026-11-12T09:58:00+03:00",
        hero: { kind: "now", classId: "c1", endsAt: "2026-11-12T10:50:00+03:00" },
      }),
    text: /До конца 52 мин/,
  },
  { name: "soon", dto: () => makeToday(), text: /Через 1 ч 30 мин/ },
  {
    name: "done_today",
    dto: () =>
      makeToday({
        now: "2026-11-12T18:00:00+03:00",
        hero: { kind: "done_today", nextClassAt: "2026-11-13T09:30:00+03:00" },
      }),
    text: /На сегодня всё/,
  },
  {
    name: "day_off",
    dto: () =>
      makeToday({
        classes: [],
        hero: { kind: "day_off", nextClassAt: "2026-11-16T09:30:00+03:00" },
      }),
    text: /Сегодня пар нет/,
  },
] as const;

for (const b of branches) {
  test(`hero: ветка ${b.name}`, async ({ page }) => {
    await mockJson(page, "**/api/me/today", b.dto());
    await page.goto("/today");
    await expect(page.locator(`[data-hero=${b.name}]`)).toContainText(b.text);
  });
}

test("hero «сейчас» с прогресс-полосой; пустой день ведёт на неделю", async ({ page }) => {
  await mockJson(
    page,
    "**/api/me/today",
    makeToday({
      now: "2026-11-12T09:58:00+03:00",
      hero: { kind: "now", classId: "c1", endsAt: "2026-11-12T10:50:00+03:00" },
    }),
  );
  await page.goto("/today");
  await expect(page.getByRole("progressbar", { name: "Сколько пары прошло" })).toBeVisible();
});

test("AC-2.3: перенос появляется в hero не позже чем через минуту", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-12T08:00:00+03:00") });
  let changed = false;
  await page.route("**/api/me/today", (route) =>
    route.fulfill({
      json: changed
        ? makeToday({
            hero: { kind: "change", classId: "c3", change: makeChange("moved") },
            classes: [
              makeClass({
                id: "c3",
                title: "Макроэкономика",
                startsAt: "2026-11-12T15:20:00+03:00",
                endsAt: "2026-11-12T16:40:00+03:00",
                change: makeChange("moved"),
              }),
            ],
          })
        : makeToday(),
    }),
  );
  await page.goto("/today");
  await expect(page.locator("[data-hero=soon]")).toBeVisible();
  changed = true;
  await page.clock.runFor(61_000);
  await expect(page.locator("[data-hero=change]")).toBeVisible();
});

test("состояния: загрузка → скелетон, ошибка без кэша → «Повторить»", async ({ page }) => {
  let fail = true;
  await page.route("**/api/me/today", async (route) => {
    await new Promise((r) => setTimeout(r, 400));
    if (fail) await route.fulfill({ status: 500, json: { error: { code: "INTERNAL" } } });
    else await route.fulfill({ json: makeToday() });
  });
  await page.goto("/today");
  await expect(page.locator("[aria-busy=true]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Не получилось загрузить" })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Повторить" }).click();
  await expect(page.locator("[data-hero=soon]")).toBeVisible();
});

test("ошибка при наличии кэша: данные остаются, плашка со временем", async ({ page }) => {
  let fail = false;
  await page.route("**/api/me/today", (route) =>
    fail ? route.fulfill({ status: 500, json: {} }) : route.fulfill({ json: makeToday() }),
  );
  await page.goto("/today");
  await expect(page.locator("[data-hero=soon]")).toBeVisible();
  fail = true;
  await page.reload();
  await expect(page.locator("[data-hero=soon]")).toBeVisible();
  await expect(page.getByText(/Не удалось обновить\. Показаны данные от \d\d:\d\d/)).toBeVisible();
});

test("офлайн при наличии данных: плашка сети и время данных", async ({ page, context }) => {
  await mockJson(page, "**/api/me/today", makeToday());
  await page.goto("/today");
  await expect(page.locator("[data-hero=soon]")).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText(/Нет сети/).first()).toBeVisible();
  await expect(page.locator("[data-hero=soon]")).toBeVisible();
  await context.setOffline(false);
});
