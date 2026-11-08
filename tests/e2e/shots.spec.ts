import { test } from "@playwright/test";
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
];

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
        await page.goto(screen.path);
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
