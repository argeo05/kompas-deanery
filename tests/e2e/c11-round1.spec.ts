import { expect, test } from "@playwright/test";
import { loginAs } from "./support/auth";

// C11, раунд 1 экспертной оценки (docs/qa/heuristic-eval.md): проверки исправленных находок
// серьёзности 3 и хвостов C8 на настоящих данных Ани.

const FIREFOX_LINUX =
  "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0 kompas-e2e";

test.beforeEach(async ({ context, baseURL }) => {
  await loginAs(context, "anna", baseURL!);
});

test("A3: вся карточка заявки — цель касания, а не только заголовок", async ({ page }) => {
  await page.goto("/requests");
  const card = page.getByTestId("request-row").first();
  await expect(card).toBeVisible();
  const box = (await card.boundingBox())!;
  // Касание в правый нижний угол карточки, мимо заголовка.
  await page.mouse.click(box.x + box.width - 8, box.y + box.height - 8);
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
});

test("B4: ссылки «ещё» — не ниже 44 px", async ({ page }) => {
  await page.goto("/today");
  const all = page.getByRole("link", { name: "Все пары" });
  await expect(all).toBeVisible();
  expect((await all.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test("A1: ссылка в абзаце отличается от текста не только цветом", async ({ page }) => {
  await page.goto("/support");
  const link = page.getByRole("link", { name: "справочнике студента" });
  await expect(link).toBeVisible();
  const style = await link.evaluate((el) => {
    const a = getComputedStyle(el);
    const p = getComputedStyle(el.parentElement!);
    return { line: a.textDecorationLine, color: a.color, parent: p.color };
  });
  expect(style.line).toContain("underline");
  expect(style.color).not.toBe(style.parent);
});

test("поиск: дедлайны и заявки из подсказки в шапке находятся", async ({ page }) => {
  await page.goto("/search?q=эссе");
  await expect(page.getByRole("heading", { name: "Дедлайны" })).toBeVisible();
  await page.goto("/search?q=справка");
  await expect(page.getByRole("heading", { name: "Мои заявки" })).toBeVisible();
});

test("B1: после «Завершить» фокус не теряется", async ({ browser, page, baseURL }, info) => {
  test.skip(info.project.name !== "desktop-1440", "один сценарий на прогон: сеансы общие");
  const other = await browser.newContext({ baseURL, userAgent: FIREFOX_LINUX });
  await loginAs(other, "anna", baseURL!);
  await other.close();

  await page.goto("/profile/privacy");
  const end = page.getByRole("button", { name: /^Завершить сеанс: Firefox/ }).first();
  await expect(end).toBeVisible();
  await end.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Сеанс завершён")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName ?? "BODY"))
    .not.toBe("BODY");
});
