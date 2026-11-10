import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs } from "../e2e/support/auth";

// WCAG 2.2 AA на экранах кабинета сотрудника (C6) в светлой и тёмной теме, данные Елены.
const routes = [
  "/staff/queue",
  "REQUEST_CARD",
  "/staff/tickets",
  "/staff/announcements",
  "/staff/announcements/new",
  "/staff/schedule",
  "SCHEDULE_SHEET",
];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`staff ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    for (const route of routes) {
      test(`axe: ${route} (${scheme})`, async ({ page, context, baseURL }) => {
        await loginAs(context, "elena", baseURL!);
        let target = route;
        if (route === "REQUEST_CARD") {
          const list = (await (await context.request.get("/api/staff/requests")).json()) as {
            items: { id: string }[];
          };
          target = `/staff/requests/${list.items[0]!.id}`;
        }
        if (route === "SCHEDULE_SHEET") target = "/staff/schedule";
        await page.goto(target);
        await page.waitForLoadState("load");
        await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
        if (route === "SCHEDULE_SHEET") {
          await page
            .getByRole("button", { name: /Изменить/ })
            .first()
            .click();
          await expect(page.getByRole("dialog", { name: "Изменить пару" })).toBeVisible();
        }
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
