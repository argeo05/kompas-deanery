import { expect, test } from "@playwright/test";
import { loginAs } from "./support/auth";

// C8 · профиль, настройки, приватность, тур первого входа (SPEC §6.1, §6.11).
// «Выйти на всех устройствах» здесь не нажимаем: оно закрыло бы сеансы Ани и Максима у параллельных
// тестов. Эта проверка (AC-11.2) — tests/integration/profile.test.ts.

test("AC-1.7: профиль показывает 5 обязательных полей, имя меняется", async ({
  browser,
  baseURL,
}) => {
  const ctx = await browser.newContext({ baseURL });
  await loginAs(ctx, "maxim", baseURL!);
  const page = await ctx.newPage();
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Профиль и настройки", level: 1 })).toBeVisible();
  const profile = page.getByRole("region", { name: "Вы" });
  await expect(profile.getByText("Орлов Максим Игоревич")).toBeVisible();
  await expect(profile.getByText("Факультет цифровых медиа")).toBeVisible();
  await expect(profile.getByText(/Магистратура/)).toBeVisible();
  await expect(profile.getByText("М-ЦМ-11")).toBeVisible();
  await expect(profile.getByText(/Очно-заочная/)).toBeVisible();
  await expect(profile.getByText(/DEMO-260211/)).toBeVisible();

  await page.getByRole("button", { name: "Изменить имя" }).click();
  await page.getByLabel("Как к вам обращаться").fill("Макс");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Макс", { exact: true })).toBeVisible();
  // Возвращаем как было: имя общее для других тестов.
  await page.getByRole("button", { name: "Изменить имя" }).click();
  await page.getByLabel("Как к вам обращаться").fill("Максим");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Максим", { exact: true })).toBeVisible();

  // Смена пароля в демо отключена и объясняет почему.
  await page.getByRole("button", { name: "Сменить пароль" }).click();
  // Текст виден на экране и уходит в общий живой регион #app-status (хвост C8, WCAG 4.1.3).
  await expect(page.locator("#content").getByText("смена пароля отключена")).toBeVisible();
  await ctx.close();
});

test("AC-11.3: крупный текст и «меньше анимации» применяются сразу и запоминаются, без горизонтальной прокрутки", async ({
  browser,
  baseURL,
}) => {
  const ctx = await browser.newContext({ baseURL });
  await loginAs(ctx, "maxim", baseURL!);
  const page = await ctx.newPage();
  await page.goto("/profile");
  const content = page.locator("#content");
  await content.getByText("Крупный", { exact: true }).click();
  await content.getByText("Меньше анимации", { exact: true }).click();
  await content.getByText("Тёмная", { exact: true }).click();
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-text", "large");
  await expect(html).toHaveAttribute("data-motion", "reduce");
  await expect(html).toHaveAttribute("data-theme", "dark");
  const fontSize = await html.evaluate((el) => getComputedStyle(el).fontSize);
  expect(fontSize).toBe("18px");

  // Сервер отдаёт те же атрибуты после перезагрузки: без «вспышки» (AC-11.1).
  await page.reload();
  await expect(html).toHaveAttribute("data-text", "large");
  await expect(html).toHaveAttribute("data-theme", "dark");
  for (const path of ["/profile", "/today", "/requests"]) {
    await page.goto(path);
    await page.locator("[aria-busy=true]").waitFor({ state: "detached" });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `горизонтальная прокрутка на ${path}`).toBeLessThanOrEqual(0);
  }
  await ctx.close();
});

test("офлайн-настройка: выключение стирает сохранённое и запоминается", async ({
  browser,
  baseURL,
}) => {
  const ctx = await browser.newContext({ baseURL });
  await loginAs(ctx, "maxim", baseURL!);
  const page = await ctx.newPage();
  await page.goto("/profile");
  const box = page.getByRole("checkbox", { name: /Хранить данные на устройстве/ });
  await expect(box).toBeChecked();
  await box.uncheck();
  await expect(page.getByText("Хранение выключено, сохранённое стёрто")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("kompas:pref:offline"))).toBe("off");
  await page.reload();
  await expect(box).not.toBeChecked();
  await box.check();
  expect(await page.evaluate(() => localStorage.getItem("kompas:pref:offline"))).toBeNull();
  await page.getByRole("button", { name: "Очистить сохранённые данные" }).click();
  await expect(page.getByText("Сохранённые данные стёрты")).toBeVisible();
  await ctx.close();
});

test("«Нашли ошибку в данных?» создаёт заявку data_fix", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL });
  await loginAs(ctx, "maxim", baseURL!);
  const page = await ctx.newPage();
  await page.goto("/profile");
  await page.getByRole("button", { name: "Нашли ошибку в данных?" }).click();
  const dialog = page.getByRole("dialog", { name: "Нашли ошибку в данных?" });
  await dialog.getByRole("button", { name: "Отправить" }).click();
  await expect(dialog.getByText("Напишите, что именно указано неверно.")).toBeVisible();
  await dialog.getByLabel("Что указано неверно").selectOption("group");
  await dialog.getByLabel("Как правильно").fill("Моя группа М-ЦМ-12");
  await dialog.getByRole("button", { name: "Отправить" }).click();
  await expect(page.getByText("Заявка отправлена")).toBeVisible();
  await ctx.close();
});

test("приватность: сеансы, завершение чужого сеанса, экспорт данных", async ({
  browser,
  baseURL,
}) => {
  const ctx = await browser.newContext({ baseURL });
  await loginAs(ctx, "anna", baseURL!);
  // Второй сеанс Ани («другой телефон»): его завершаем из первого.
  const other = await browser.newContext({
    baseURL,
    userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36",
  });
  await loginAs(other, "anna", baseURL!);
  expect((await other.request.get("/api/me")).status()).toBe(200);

  const page = await ctx.newPage();
  await page.goto("/profile/privacy");
  await expect(page.getByRole("heading", { name: "Приватность", level: 1 })).toBeVisible();
  await expect(page.getByText("это устройство")).toBeVisible();
  await expect(page.getByText("Что хранится и зачем")).toBeVisible();
  const end = page.getByRole("button", { name: /Завершить сеанс: Chrome · Android/ });
  await end.first().click();
  await expect(page.getByText("Сеанс завершён")).toBeVisible();
  expect((await other.request.get("/api/me")).status()).toBe(401);

  // «Выйти на всех» просит подтверждение и не выполняется без него.
  await page.getByRole("button", { name: "Выйти на всех устройствах" }).click();
  await expect(page.getByText("Вы выйдете из Компаса на всех устройствах")).toBeVisible();
  await page.getByRole("button", { name: "Отмена" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Скачать данные" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("kompas-my-data.json");
  const { readFileSync } = await import("node:fs");
  const json = JSON.parse(readFileSync((await download.path())!, "utf8")) as {
    profile: { login: string };
  };
  expect(json.profile.login).toBe("anna.demo");
  await Promise.all([ctx.close(), other.close()]);
});

test("тур первого входа: 3 шага и настройки, «Готово» запоминает выбор", async ({
  browser,
  baseURL,
}) => {
  const ctx = await browser.newContext({ baseURL });
  await loginAs(ctx, "maxim", baseURL!);
  const page = await ctx.newPage();
  // Сервер отвечает, что тур ещё не пройден (как у нового студента); остальные запросы настоящие.
  let patched = false;
  await page.route("**/api/me", async (route) => {
    const req = route.request();
    if (req.method() === "PATCH") {
      patched = true;
      return route.continue();
    }
    const res = await route.fetch();
    const body = (await res.json()) as Record<string, unknown>;
    await route.fulfill({ response: res, json: { ...body, onboardingDone: false } });
  });
  await page.goto("/today");
  const tour = page.getByRole("dialog");
  await expect(tour.getByRole("heading", { name: "Всё о дне на одном экране" })).toBeVisible();
  await expect(tour.getByText("Шаг 1 из 4")).toBeVisible();
  await tour.getByRole("button", { name: "Далее" }).click();
  await expect(tour.getByRole("heading", { name: "Справки — как посылки" })).toBeVisible();
  await tour.getByRole("button", { name: "Далее" }).click();
  await expect(tour.getByRole("heading", { name: "Работает без интернета" })).toBeVisible();
  await tour.getByRole("button", { name: "Далее" }).click();
  await expect(tour.getByRole("heading", { name: "Две настройки напоследок" })).toBeVisible();
  await tour.getByRole("radio", { name: /Вечерний/ }).check();
  await tour.getByRole("button", { name: "Готово" }).click();
  await expect(tour).toBeHidden();
  expect(patched).toBe(true);
  // Выбор дайджеста сохранён.
  const prefs = (await (await ctx.request.get("/api/me/notification-prefs")).json()) as {
    slots: number[];
  };
  expect(prefs.slots).toEqual([720, 1050, 1290]);
  await ctx.close();
});

test("тур можно пропустить, а потом показать снова из профиля", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL });
  await loginAs(ctx, "maxim", baseURL!);
  const page = await ctx.newPage();
  await page.goto("/profile");
  await page.getByRole("button", { name: "Показать тур по Компасу" }).click();
  const tour = page.getByRole("dialog");
  await expect(tour.getByRole("heading", { name: "Всё о дне на одном экране" })).toBeVisible();
  await tour.getByRole("button", { name: "Пропустить" }).click();
  await expect(tour).toBeHidden();
  await ctx.close();
});

test("профиль сотрудника: имя, подразделение, выход; Студенту /staff/profile закрыт", async ({
  browser,
  baseURL,
}) => {
  const staff = await browser.newContext({ baseURL });
  await loginAs(staff, "elena", baseURL!);
  const page = await staff.newPage();
  await page.goto("/staff/profile");
  await expect(page.getByRole("heading", { name: "Профиль", level: 1 })).toBeVisible();
  await expect(page.getByText("Подразделение")).toBeVisible();
  await expect(page.locator("#content").getByRole("button", { name: "Выйти" })).toBeVisible();

  const student = await browser.newContext({ baseURL });
  await loginAs(student, "maxim", baseURL!);
  const res = await student.request.get("/staff/profile");
  expect(res.status()).toBe(403);
  await Promise.all([staff.close(), student.close()]);
});
