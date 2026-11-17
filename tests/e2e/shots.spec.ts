import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { loginAs } from "./support/auth";

// pnpm shots: скриншоты экранов в светлой и тёмной теме для docs/process/shots/ (SPEC §12.4 п.5).
// Не входит в pnpm test:e2e (фильтр по тегу @shots).
const screens = [
  { name: "home", path: "/" },
  { name: "login", path: "/login" },
  { name: "jury", path: "/jury" },
  { name: "about", path: "/about" },
  { name: "security", path: "/security" },
  { name: "offline-no-user", path: "/offline" },
  { name: "dev-ui", path: "/dev/ui" },
  { name: "dev-ui-staff", path: "/dev/ui/staff" },
];
// Экраны кабинета студента (C3): вход Анной, ждём конец загрузки.
const studentScreens = [
  { name: "today", path: "/today" },
  { name: "schedule-day", path: "/schedule" },
  { name: "schedule-week", path: "/schedule?view=week" },
  { name: "study", path: "/study" },
  { name: "study-session", path: "/study/session" },
  { name: "requests", path: "/requests" },
  { name: "requests-new", path: "/requests/new" },
  { name: "requests-form", path: "/requests/new/study_cert" },
  { name: "documents", path: "/documents" },
  { name: "request-card", path: "REQUEST_CARD" },
  { name: "notifications", path: "/notifications" },
  { name: "notifications-settings", path: "/notifications/settings" },
  { name: "deadlines", path: "/study/deadlines" },
  { name: "support", path: "/support" },
  { name: "support-new", path: "/support/new" },
  { name: "search", path: "/search?q=%D0%B2%D0%BE%D0%B5%D0%BD%D0%BA%D0%BE%D0%BC%D0%B0%D1%82" },
  { name: "help-article", path: "/help/resit-exam" },
  { name: "help-ask", path: "/help/ask" },
  { name: "profile", path: "/profile" },
  { name: "profile-privacy", path: "/profile/privacy" },
  { name: "verify", path: `/verify/${"0".repeat(64)}` },
];

// Экраны кабинета сотрудника (C6): вход Еленой.
const staffScreens = [
  { name: "staff-queue", path: "/staff/queue" },
  { name: "staff-request", path: "STAFF_REQUEST" },
  { name: "staff-tickets", path: "/staff/tickets" },
  { name: "staff-announcements", path: "/staff/announcements" },
  { name: "staff-announcement-new", path: "/staff/announcements/new" },
  { name: "staff-schedule", path: "/staff/schedule" },
  { name: "staff-profile", path: "/staff/profile" },
];

/** REQUEST_CARD — первая заявка Анны (новые первыми). */
async function resolvePath(context: BrowserContext, path: string): Promise<string> {
  if (path === "STAFF_REQUEST") {
    const list = (await (await context.request.get("/api/staff/requests")).json()) as {
      items: { id: string }[];
    };
    return `/staff/requests/${list.items[0]!.id}`;
  }
  if (path !== "REQUEST_CARD") return path;
  const list = (await (await context.request.get("/api/me/requests")).json()) as {
    items: { id: string }[];
  };
  return `/requests/${list.items[0]!.id}`;
}

// Офлайн (C7): кабинет из данных устройства без сети. Максим — чтобы не трогать данные Анны.
async function shootOffline(page: Page, name: string, project: string, scheme: string) {
  await page.locator("[aria-busy=true]").waitFor({ state: "detached" });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `docs/process/shots/${name}-${project}-${scheme}.png`,
    fullPage: true,
  });
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`@shots offline ${scheme}`, () => {
    test.use({ colorScheme: scheme, serviceWorkers: "allow" });
    test(`@shots offline ${scheme}`, async ({ context, page, baseURL }, info) => {
      await loginAs(context, "maxim", baseURL!);
      await page.goto("/today");
      await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
          timeout: 20_000,
        })
        .toBe(true);
      // Подготовка офлайна идёт в фоне: ждём, пока сохранится расписание следующей недели.
      await page.waitForTimeout(3000);
      await context.setOffline(true);
      const p = info.project.name;
      await page.goto("/today");
      await shootOffline(page, "offline-today", p, scheme);
      await page.goto("/schedule");
      await shootOffline(page, "offline-schedule", p, scheme);
      await page.goto("/requests/new/study_cert");
      await page.getByLabel("Куда предоставляется справка").fill("Военкомат");
      await page.getByRole("radio", { name: /Электронно/ }).check();
      await page.getByRole("button", { name: "Отправить" }).click();
      await page.getByTestId("request-queued").waitFor();
      await shootOffline(page, "offline-request-queued", p, scheme);
      await page.getByRole("link", { name: "К заявкам" }).click();
      await page.getByTestId("queued-request").waitFor();
      await shootOffline(page, "offline-requests", p, scheme);
      await page.goto("/search");
      await shootOffline(page, "offline-not-available", p, scheme);
      // Контекст закрывается без сети: заявка из очереди на сервер не уходит.
    });
  });
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`@shots ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    for (const screen of screens) {
      test(`@shots ${screen.name} ${scheme}`, async ({ page }, info) => {
        await page.goto(screen.path);
        await page.screenshot({
          path: `docs/process/shots/${screen.name}-${info.project.name}-${scheme}.png`,
          fullPage: true,
        });
      });
    }

    for (const screen of studentScreens) {
      test(`@shots ${screen.name} ${scheme}`, async ({ context, page, baseURL }, info) => {
        await loginAs(context, "anna", baseURL!);
        await page.goto(await resolvePath(context, screen.path));
        await page.waitForLoadState("load");
        await page.locator("[aria-busy=true]").waitFor({ state: "detached" });
        await page.waitForTimeout(400);
        await page.screenshot({
          path: `docs/process/shots/${screen.name}-${info.project.name}-${scheme}.png`,
          fullPage: true,
        });
      });
    }

    for (const screen of staffScreens) {
      test(`@shots ${screen.name} ${scheme}`, async ({ context, page, baseURL }, info) => {
        await loginAs(context, "elena", baseURL!);
        await page.goto(await resolvePath(context, screen.path));
        await page.waitForLoadState("load");
        await page.locator("[aria-busy=true]").waitFor({ state: "detached" });
        await page.waitForTimeout(400);
        await page.screenshot({
          path: `docs/process/shots/${screen.name}-${info.project.name}-${scheme}.png`,
          fullPage: true,
        });
      });
    }
  });
}

// C9: помощник «Спросить Компас» с ответом и с отказом «не нашёл».
for (const scheme of ["light", "dark"] as const) {
  test.describe(`@shots assistant ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    for (const [name, question] of [
      ["help-ask-answer", "Как пересдать экзамен?"],
      ["help-ask-notfound", "Где припарковать машину у корпуса?"],
    ] as const) {
      test(`@shots ${name} ${scheme}`, async ({ context, page, baseURL }, info) => {
        await loginAs(context, "anna", baseURL!);
        await page.goto("/help/ask");
        await page.getByLabel("Ваш вопрос").fill(question);
        await page.getByRole("button", { name: "Спросить" }).click();
        await page.getByText("Сегодня можно задать ещё").waitFor();
        await page.screenshot({
          path: `docs/process/shots/${name}-${info.project.name}-${scheme}.png`,
          fullPage: true,
        });
      });
    }
  });
}
