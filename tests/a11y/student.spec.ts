import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs } from "../e2e/support/auth";

// WCAG 2.2 AA на экранах студента (C3) в светлой и тёмной теме, на настоящих данных Анны.
const routes = [
  "/login",
  "/today",
  "/profile",
  "/profile/privacy",
  "/schedule",
  "/schedule?view=week",
  "/study",
  "/study/session",
  "/requests",
  "/requests/new",
  "/requests/new/study_cert",
  "/documents",
  "REQUEST_CARD",
  "/notifications",
  "/notifications?tab=announcements",
  "/notifications/settings",
  "/study/deadlines",
  "/support",
  "/support/new",
  "/search?q=%D0%B2%D0%BE%D0%B5%D0%BD%D0%BA%D0%BE%D0%BC%D0%B0%D1%82",
  "/help",
  "/help/resit-exam",
  `/verify/${"0".repeat(64)}`,
];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme}`, () => {
    test.use({ colorScheme: scheme });
    for (const route of routes) {
      test(`axe: ${route} (${scheme})`, async ({ page, context, baseURL }) => {
        if (route !== "/login") await loginAs(context, "anna", baseURL!);
        let target = route;
        if (route === "REQUEST_CARD") {
          const list = (await (await context.request.get("/api/me/requests")).json()) as {
            items: { id: string }[];
          };
          target = `/requests/${list.items[0]!.id}`;
        }
        await page.goto(target);
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
