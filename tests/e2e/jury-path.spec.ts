import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./support/auth";

// C8 · jury-path (AC-12.2, Q-1.2): весь маршрут со страницы /jury проходит эксперт на телефоне 360 px
// (и на десктопе). Шаг 7 маршрута (режим полёта) проверяет tests/e2e/offline.spec.ts.

/** Тур первого входа может открыться поверх «Сегодня»: эксперт нажимает «Пропустить». */
async function skipTourIfShown(page: Page) {
  await page
    .getByRole("button", { name: "Пропустить" })
    .click({ timeout: 4000 })
    .catch(() => undefined);
}

test("маршрут проверки /jury: Аня → справка → Елена → PDF → чужая заявка недоступна", async ({
  browser,
  baseURL,
}) => {
  // Страница «Для жюри» открыта без входа: аккаунты и сам маршрут на месте.
  const guest = await browser.newContext({ baseURL });
  const jury = await guest.newPage();
  await jury.goto("/jury");
  await expect(jury.getByRole("heading", { name: "Для жюри", level: 1 })).toBeVisible();
  await expect(jury.getByText("anna.demo")).toBeVisible();
  await expect(jury.getByText("maxim.demo")).toBeVisible();
  await expect(jury.getByText("elena.staff")).toBeVisible();
  await expect(jury.getByRole("heading", { name: "Маршрут проверки на 5 минут" })).toBeVisible();
  // Футер: все три страницы доступны с любой страницы (AC-12.1).
  for (const name of ["О проекте", "Для жюри", "Безопасность"]) {
    await expect(
      jury.getByRole("navigation", { name: "Страницы о проекте" }).getByRole("link", { name }),
    ).toBeVisible();
  }
  // Сброс спрашивает подтверждение и не выполняется сам (само действие — tests/integration/profile.test.ts).
  await jury.getByRole("button", { name: "Сбросить демо-данные" }).click();
  await expect(jury.getByText("Все изменения в демо-аккаунтах пропадут")).toBeVisible();
  await jury.getByRole("button", { name: "Отмена" }).click();

  // Шаг 1 (Q-1.2): с экрана входа — одно касание «Войти как Аня».
  const page = await guest.newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: /Войти как Аня/ }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Аня|Анна/);
  await skipTourIfShown(page);

  // Шаг 2: «Учёба».
  await page.goto("/study");
  await expect(page.getByRole("heading", { name: "Учёба", level: 1 })).toBeVisible();

  // Шаг 3: справка об обучении.
  await page.goto("/requests/new");
  await page.getByRole("link", { name: "Справка об обучении" }).first().click();
  await page.getByLabel("Куда предоставляется справка").fill("в банк (проверка жюри)");
  await page.getByRole("radio", { name: /Электронно/ }).check();
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(page.getByTestId("request-success")).toBeVisible();
  await page.getByRole("link", { name: "Перейти к заявке" }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  const requestPath = new URL(page.url()).pathname;
  const id = requestPath.split("/").pop()!;

  // Шаг 4: Елена Сергеевна берёт заявку в работу и нажимает «Готово».
  const staffCtx = await browser.newContext({ baseURL });
  await loginAs(staffCtx, "elena", baseURL!);
  const staff = await staffCtx.newPage();
  await staff.goto(`/staff/requests/${id}`);
  await staff.getByRole("button", { name: "Взять в работу" }).click();
  await staff.getByRole("button", { name: "Готово" }).click();
  await expect(staff.getByText("Заявка готова, студент получил уведомление")).toBeVisible();

  // Шаг 5: у Ани справка готова, PDF скачивается.
  await page.reload();
  await expect(page.getByText("Готова · можно скачать")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("download-pdf").click();
  const bytes = readFileSync((await (await downloadPromise).path())!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");

  // Шаг 6: Максим открывает адрес заявки Ани и видит «Заявка не найдена».
  const maximCtx = await browser.newContext({ baseURL });
  await loginAs(maximCtx, "maxim", baseURL!);
  const maxim = await maximCtx.newPage();
  await maxim.goto(requestPath);
  await expect(maxim.getByRole("heading", { name: "Заявка не найдена" })).toBeVisible();

  await Promise.all([guest.close(), staffCtx.close(), maximCtx.close()]);
});

test("страницы «О проекте» и «Безопасность» открываются без входа и ведут на доказательства", async ({
  page,
}) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "О проекте", level: 1 })).toBeVisible();
  await expect(page.getByText("Не является официальным сервисом")).toBeVisible();
  await page.goto("/about#research");
  await expect(page.getByRole("heading", { name: "Ставки и исследования" })).toBeInViewport();

  await page.goto("/security");
  await expect(page.getByRole("heading", { name: "Безопасность", level: 1 })).toBeVisible();
  await expect(page.getByText("tests/security/idor.spec.ts").first()).toBeVisible();
});
