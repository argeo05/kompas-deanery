import { expect, test, type BrowserContext } from "@playwright/test";
import { loginAs } from "./support/auth";

// C5: уведомления и объявления, дедлайны и планы, обращения, поиск и ⌘K, подписка на календарь.
// Студент — anna.demo, сотрудник — elena.staff (действует через API: её кабинет делается в C6).

async function staffPost(staff: BrowserContext, baseURL: string, path: string, data: unknown) {
  const res = await staff.request.post(path, {
    data,
    headers: { origin: baseURL, "idempotency-key": crypto.randomUUID() },
  });
  expect(res.status(), await res.text()).toBeLessThan(300);
  return res;
}

test("объявление: опасный Markdown остаётся текстом, «Отметить всё прочитанным» работает", async ({
  browser,
  baseURL,
}) => {
  const anna = await browser.newContext({ baseURL });
  const elena = await browser.newContext({ baseURL });
  await loginAs(anna, "anna", baseURL!);
  await loginAs(elena, "elena", baseURL!);
  const title = `Проверка ${Date.now()}`;
  await staffPost(elena, baseURL!, "/api/staff/announcements", {
    title,
    bodyMd:
      "Текст **важный** <script>window.__xss=1</script> [ссылка](javascript:window.__xss=1) [сайт](https://example.edu)",
    audience: { courses: [1] },
    important: true,
  });

  const page = await anna.newPage();
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "Уведомления", level: 1 })).toBeVisible();
  // Важное объявление пришло срочным уведомлением.
  await expect(page.getByText(title).first()).toBeVisible();

  await page.getByRole("button", { name: "Объявления" }).click();
  const card = page.locator("section, li").filter({ hasText: title }).first();
  await expect(card).toBeVisible();
  await expect(page.locator("script", { hasText: "__xss" })).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
  ).toBeUndefined();
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: /сайт/ }).first()).toHaveAttribute(
    "href",
    "https://example.edu",
  );

  await page.getByRole("button", { name: "Все", exact: true }).click();
  const markAll = page.getByRole("button", { name: "Отметить всё прочитанным" });
  await expect(markAll).toBeVisible();
  if (await markAll.isEnabled()) await markAll.click();
  await expect(page.getByText("Всё прочитано")).toBeVisible();
  await anna.close();
  await elena.close();
});

test("настройки уведомлений сохраняются, «Только срочное» не трогает расписание", async ({
  context,
  page,
  baseURL,
}, info) => {
  // Проекты идут параллельно: у каждого свой студент, чтобы настройки не мешали друг другу.
  await loginAs(context, info.project.name === "mobile-360" ? "anna" : "maxim", baseURL!);
  await page.goto("/notifications/settings");
  await page.getByRole("button", { name: "Вечерний: 12:00, 17:30, 21:30" }).click();
  await page.getByRole("group", { name: "Оценки" }).getByRole("button", { name: "Сразу" }).click();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Настройки сохранены")).toBeVisible();
  const prefs = await (await context.request.get("/api/me/notification-prefs")).json();
  expect(prefs.slots).toEqual([720, 1050, 1290]);
  expect(prefs.immediateCategories).toContain("grade");

  await page.getByRole("button", { name: "Только срочное", exact: true }).click();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Настройки сохранены")).toBeVisible();
  const urgent = await (await context.request.get("/api/me/notification-prefs")).json();
  expect(urgent.disabledCategories).not.toContain("schedule");
  expect(urgent.disabledCategories).toContain("grade");

  // Возвращаем настройки по умолчанию, чтобы не влиять на другие сценарии.
  await context.request.put("/api/me/notification-prefs", {
    data: {
      slots: [480, 780, 1140],
      preset: "default",
      quietFrom: prefs.quietFrom,
      quietTo: prefs.quietTo,
      immediateCategories: [],
      disabledCategories: [],
    },
    headers: { origin: baseURL! },
  });
});

test("дедлайн: звёздочка, окно без пар, план «если–то»", async ({ context, page, baseURL }) => {
  await loginAs(context, "anna", baseURL!);
  const title = `Эссе ${Date.now()}`;
  const created = await context.request.post("/api/me/deadlines", {
    data: { title, dueAt: new Date(Date.now() + 5 * 24 * 3600_000).toISOString() },
    headers: { origin: baseURL!, "idempotency-key": crypto.randomUUID() },
  });
  expect(created.status()).toBeLessThan(300);

  await page.goto("/study/deadlines");
  const card = page.locator("li").filter({ hasText: title });
  await expect(card).toBeVisible();
  // Для неважного дедлайна кнопки «Когда займусь?» нет: лишняя кнопка — шум (SPEC §6.7 п.8).
  await expect(card.getByRole("button", { name: "Когда займусь?" })).toHaveCount(0);
  await card.getByRole("button", { name: "Отметить важным" }).click();
  await card.getByRole("button", { name: "Когда займусь?" }).click();

  const dialog = page.getByRole("dialog", { name: "Когда займусь?" });
  await expect(dialog.getByRole("radio").first()).toBeVisible();
  await dialog.getByLabel("Что сделаю первым").fill("открою черновик");
  await dialog.getByRole("button", { name: "Сохранить план" }).click();
  await expect(
    card.getByText(/Если .*, то открою черновик|Если .* — открою черновик/),
  ).toBeVisible();

  await card.getByRole("button", { name: "Сделал" }).click();
  await expect(page.getByRole("heading", { name: "Сделано" })).toBeVisible();
});

test("обращение: студент пишет, сотрудник отвечает, студент видит ответ", async ({
  browser,
  baseURL,
}) => {
  const anna = await browser.newContext({ baseURL });
  const elena = await browser.newContext({ baseURL });
  await loginAs(anna, "anna", baseURL!);
  await loginAs(elena, "elena", baseURL!);
  const page = await anna.newPage();
  await page.goto("/support/new?topic=dorm");
  await page.getByLabel("Ваш вопрос").fill("Когда продлевать место в общежитии?");
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(page).toHaveURL(/\/support\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;
  await expect(page.getByText("Когда продлевать место в общежитии?")).toBeVisible();
  await expect(page.getByText("Отправлено", { exact: true })).toBeVisible();

  await staffPost(elena, baseURL!, `/api/staff/tickets/${id}/messages`, {
    body: "Продлить можно до 20 числа.",
  });
  await page.reload();
  await expect(page.getByText("Продлить можно до 20 числа.")).toBeVisible();
  await expect(page.getByText("Отвечено", { exact: true })).toBeVisible();
  await anna.close();
  await elena.close();
});

test("поиск: «военкомат» ведёт на справку, опечатка находит дисциплину", async ({
  context,
  page,
  baseURL,
}, info) => {
  await loginAs(context, "anna", baseURL!);
  await page.goto("/today");
  if (info.project.name === "desktop-1440") {
    const box = page.getByRole("combobox");
    // Обработчик клавиши вешается при гидратации: повторяем, пока диалог не откроется.
    await expect(async () => {
      await page.keyboard.press("Control+k");
      await expect(box).toBeVisible({ timeout: 500 });
    }).toPass();
    await expect(box).toBeFocused();
    await box.fill("военкомат");
    const first = page.getByRole("option").first();
    await expect(first).toContainText("военкомат");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/requests\/new\/.+/);
  } else {
    await page.getByRole("link", { name: "Поиск" }).first().click();
    await expect(page).toHaveURL(/\/search/);
    // Поле управляемое: до гидратации введённый текст сбрасывается, поэтому повторяем ввод.
    await expect(async () => {
      await page.getByRole("searchbox").fill("военкомат");
      await expect(page.getByRole("link", { name: /военкомат/i }).first()).toBeVisible({
        timeout: 1500,
      });
    }).toPass();
  }
  await page.goto("/search?q=макроэкномика");
  await expect(page.getByRole("link", { name: /Макроэкономика/ }).first()).toBeVisible();
  await page.goto("/search?q=ъъъъъъ");
  await expect(page.getByRole("heading", { name: /Ничего не нашли/ })).toBeVisible();
});

test("календарь: ссылка, VTIMEZONE Europe/Moscow, сброс отзывает старую", async ({
  context,
  page,
  baseURL,
}) => {
  await loginAs(context, "anna", baseURL!);
  await page.goto("/schedule");
  await page.getByRole("button", { name: "Подписаться на календарь" }).click();
  const input = page.getByLabel("Ваша личная ссылка");
  await expect(input).toHaveValue(/\/api\/ics\/[\w-]{43}\.ics$/);
  const first = new URL(await input.inputValue());
  const feed = await context.request.get(first.pathname);
  expect(feed.status()).toBe(200);
  const text = await feed.text();
  expect(text).toContain("BEGIN:VTIMEZONE");
  expect(text).toContain("TZID:Europe/Moscow");
  expect(text).toMatch(/UID:class-[0-9a-f-]{36}@kompas/);

  await page.getByRole("button", { name: "Сбросить ссылку" }).click();
  await page.getByRole("button", { name: "Да, сбросить" }).click();
  await expect(input).not.toHaveValue(first.toString());
  expect((await context.request.get(first.pathname)).status()).toBe(404);
  const second = new URL(await input.inputValue());
  expect((await context.request.get(second.pathname)).status()).toBe(200);
});

test("справочник: статья открывается и содержит заголовки", async ({ context, page, baseURL }) => {
  await loginAs(context, "anna", baseURL!);
  await page.goto("/help/resit-exam");
  await expect(
    page.getByRole("heading", { name: "Как пересдать экзамен", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Шаги" })).toBeVisible();
  await page.goto("/help/net-takoj");
  await expect(page.getByRole("heading", { name: "Статья не найдена" })).toBeVisible();
});
