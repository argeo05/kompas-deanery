import { test } from "@playwright/test";

// pnpm shots: скриншоты экранов в светлой и тёмной теме для docs/process/shots/ (SPEC §12.4 п.5).
// Не входит в pnpm test:e2e (фильтр по тегу @shots).
const screens = [
  { name: "home", path: "/" },
  { name: "dev-ui", path: "/dev/ui" },
  { name: "dev-ui-staff", path: "/dev/ui/staff" },
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
  });
}
