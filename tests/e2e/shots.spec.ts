import { test, type BrowserContext } from "@playwright/test";
import { loginAs } from "./support/auth";

// pnpm shots: скриншоты экранов в светлой и тёмной теме для docs/process/shots/ (SPEC §12.4 п.5).
// Не входит в pnpm test:e2e (фильтр по тегу @shots).
const screens = [
  { name: "home", path: "/" },
  { name: "login", path: "/login" },
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
