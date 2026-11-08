import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs } from "../e2e/support/auth";

// WCAG 2.2 AA на экранах студента (C3) в светлой и тёмной теме, на настоящих данных Анны.
const routes = ["/login", "/today", "/schedule", "/schedule?view=week", "/study", "/study/session"];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme}`, () => {
    test.use({ colorScheme: scheme });
    for (const route of routes) {
      test(`axe: ${route} (${scheme})`, async ({ page, context, baseURL }) => {
        if (route !== "/login") await loginAs(context, "anna", baseURL!);
        await page.goto(route);
        await page.waitForLoadState("load");
        if (route !== "/login") await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
        // Карточки изменений появляются с анимацией прозрачности: axe должен мерить итоговые цвета.
        await page.waitForTimeout(600);
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
