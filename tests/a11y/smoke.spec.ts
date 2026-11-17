import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// WCAG 2.2 AA (SPEC §7.7) в светлой и тёмной теме. Каждый новый экран добавляется сюда списком маршрутов.
const routes = [
  "/",
  "/about",
  "/security",
  "/jury",
  "/offline",
  "/dev/ui",
  "/dev/ui/staff",
  `/verify/${"0".repeat(64)}`,
];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme}`, () => {
    test.use({ colorScheme: scheme });
    for (const route of routes) {
      test(`axe: ${route} без нарушений WCAG 2.2 AA (${scheme})`, async ({ page }) => {
        await page.goto(route);
        const { violations } = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(
          violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target).join(", ")}`),
        ).toEqual([]);
      });
    }
  });
}
