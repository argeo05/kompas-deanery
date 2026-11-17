import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "../e2e/support/auth";

// WCAG 2.2 AA для открытых листов профиля (C8): тур первого входа и «Нашли ошибку в данных?».
async function axe(page: Page) {
  await page.waitForTimeout(500);
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target).join(", ")}`),
  ).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test(`axe: тур первого входа, первый и последний шаг (${scheme})`, async ({
      page,
      context,
      baseURL,
    }) => {
      await loginAs(context, "maxim", baseURL!);
      await page.goto("/profile");
      await page.getByRole("button", { name: "Показать тур по Компасу" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await axe(page);
      for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Далее" }).click();
      await expect(page.getByRole("heading", { name: "Две настройки напоследок" })).toBeVisible();
      await axe(page);
    });

    test(`axe: «Нашли ошибку в данных?» с ошибкой (${scheme})`, async ({
      page,
      context,
      baseURL,
    }) => {
      await loginAs(context, "maxim", baseURL!);
      await page.goto("/profile");
      await page.getByRole("button", { name: "Нашли ошибку в данных?" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Отправить" }).click();
      await expect(page.getByText("Напишите, что именно указано неверно.")).toBeVisible();
      await axe(page);
    });
  });
}
