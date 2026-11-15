import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { pdfText } from "../helpers/pdf-text";
import { loginAs } from "./support/auth";

// C4: заявки, справки, PDF с QR и /verify (SPEC §6.5, AC-5.1, AC-5.5, AC-9.2).
// Два браузерных контекста: студент (anna.demo) и сотрудник (elena.staff).

async function staffDo(
  staff: BrowserContext,
  baseURL: string,
  id: string,
  body: Record<string, string>,
) {
  const res = await staff.request.post(`/api/staff/requests/${id}/transition`, {
    data: body,
    headers: { origin: baseURL },
  });
  expect(res.status(), await res.text()).toBe(200);
}

async function submitStudyCert(page: Page, destination: string) {
  await page.goto("/requests/new");
  await page.getByRole("link", { name: "Справка об обучении" }).first().click();
  await page.getByLabel("Куда предоставляется справка").fill(destination);
  await page.getByRole("radio", { name: /Электронно/ }).check();
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(page.getByTestId("request-success")).toBeVisible();
  await page.getByRole("link", { name: "Перейти к заявке" }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

test("AC-9.2: полный цикл — подача, уточнение, готово, PDF с QR, /verify", async ({
  browser,
  baseURL,
}) => {
  const studentCtx = await browser.newContext({ baseURL });
  const staffCtx = await browser.newContext({ baseURL });
  await loginAs(studentCtx, "anna", baseURL!);
  await loginAs(staffCtx, "elena", baseURL!);
  const page = await studentCtx.newPage();

  // AC-5.1: каталог → форма → «Отправить» → успех.
  const id = await submitStudyCert(page, "в банк");
  await expect(page.getByText("Отправлена · ждёт сотрудника")).toBeVisible();

  await staffDo(staffCtx, baseURL!, id, { action: "take" });
  await staffDo(staffCtx, baseURL!, id, { action: "need_info", comment: "Уточните, какой банк" });

  await page.reload();
  await expect(page.getByTestId("needs-info")).toContainText("Уточните, какой банк");
  await page.getByLabel("Ваш ответ сотруднику").fill("Сбербанк, ипотека");
  await page.getByRole("button", { name: "Отправить ответ" }).click();
  await expect(page.getByTestId("message").filter({ hasText: "Сбербанк, ипотека" })).toBeVisible();
  await expect(page.getByText(/В работе · /)).toBeVisible();

  await staffDo(staffCtx, baseURL!, id, { action: "ready" });
  await page.reload();
  await expect(page.getByText("Готова · можно скачать")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("download-pdf").click();
  const download = await downloadPromise;
  const path = await download.path();
  const { readFileSync } = await import("node:fs");
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  const { text, images } = await pdfText(bytes);
  expect(text).toContain("НЕ ЯВЛЯЕТСЯ ОФИЦИАЛЬНЫМ ДОКУМЕНТОМ");
  expect(images).toBeGreaterThanOrEqual(1);
  const url = /https?:\/\/[^\s]*\/verify\/[0-9a-f]{64}/.exec(text.replaceAll(" ", ""));
  expect(url, "в PDF есть ссылка проверки").not.toBeNull();

  // Ссылка из PDF открывает рабочую /verify без входа и без ФИО.
  const guest = await browser.newContext({ baseURL });
  const verify = await guest.newPage();
  await verify.goto(new URL(url![0]).pathname);
  await expect(verify.getByRole("heading", { name: "Документ найден" })).toBeVisible();
  await expect(verify.getByTestId("verify-type")).toHaveText("Справка об обучении");
  const html = await verify.content();
  expect(html).not.toMatch(/Анн|Аня|Иванов|СП-\d{4}/);

  // Чужой студент не скачает файл (AC-5.3).
  const docs = (await (await studentCtx.request.get("/api/me/documents")).json()) as {
    items: { id: string; requestId: string }[];
  };
  const mine = docs.items.find((d) => d.requestId === id)!;
  const maxim = await browser.newContext({ baseURL });
  await loginAs(maxim, "maxim", baseURL!);
  expect((await maxim.request.get(`/api/me/documents/${mine.id}/file`)).status()).toBe(404);

  await staffDo(staffCtx, baseURL!, id, { action: "issue" });
  await page.goto("/documents");
  await expect(page.getByTestId("document-row").first()).toBeVisible();

  await Promise.all([studentCtx.close(), staffCtx.close(), guest.close(), maxim.close()]);
});

test("отказ не тупик: причина, «Подать заново» с заполненной формой", async ({
  browser,
  baseURL,
}) => {
  const studentCtx = await browser.newContext({ baseURL });
  const staffCtx = await browser.newContext({ baseURL });
  await loginAs(studentCtx, "anna", baseURL!);
  await loginAs(staffCtx, "elena", baseURL!);
  const page = await studentCtx.newPage();
  const id = await submitStudyCert(page, "в визовый центр");

  await staffDo(staffCtx, baseURL!, id, { action: "take" });
  await staffDo(staffCtx, baseURL!, id, {
    action: "reject",
    rejectReason: "INCOMPLETE",
    comment: "Укажите страну визового центра",
  });
  await page.reload();
  await expect(page.getByTestId("rejection")).toContainText("Укажите страну визового центра");
  await page.getByRole("link", { name: "Подать заново" }).click();
  await expect(page.getByLabel("Куда предоставляется справка")).toHaveValue("в визовый центр");
  await page.getByLabel("Куда предоставляется справка").fill("в визовый центр Польши");
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(page.getByTestId("request-success")).toBeVisible();
  await Promise.all([studentCtx.close(), staffCtx.close()]);
});

test("черновик формы возвращается после перезагрузки", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL });
  await loginAs(ctx, "anna", baseURL!);
  const page = await ctx.newPage();
  await page.goto("/requests/new/dorm_cert");
  await page.getByLabel(/Общежитие \(корпус\)/).fill("Корпус 3");
  // Ждём записи черновика в localStorage.
  await expect
    .poll(() => page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes("draft"))))
    .toHaveLength(1);
  await page.reload();
  await expect(page.getByLabel(/Общежитие \(корпус\)/)).toHaveValue("Корпус 3");
  await ctx.close();
});

test("пустая обязательная форма не уходит и показывает причины", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL });
  await loginAs(ctx, "anna", baseURL!);
  const page = await ctx.newPage();
  await page.goto("/requests/new/study_cert");
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(page.getByText("Заполните это поле").first()).toBeVisible();
  await ctx.close();
});

test("AC-5.5: /verify на несуществующий код — «не найден», без данных", async ({ page }) => {
  await page.goto(`/verify/${"0".repeat(64)}`);
  await expect(page.getByRole("heading", { name: "Документ не найден" })).toBeVisible();
  await expect(page.getByText("Чего мы не показываем")).toBeVisible();
});

test("заказ справки об обучении за 4 касания: «Заявки» → частая справка → «В банк» → «Отправить»", async ({
  browser,
  baseURL,
}) => {
  const ctx = await browser.newContext({ baseURL });
  await loginAs(ctx, "maxim", baseURL!);
  const page = await ctx.newPage();
  await page.goto("/today");
  let taps = 0;
  const tap = async (click: () => Promise<void>) => {
    taps += 1;
    await click();
  };
  await tap(() =>
    page
      .getByRole("link", { name: /^Заявки/ })
      .first()
      .click(),
  );
  await tap(() => page.getByRole("link", { name: "Заказать: справка об обучении" }).click());
  // Способ получения и «1 экземпляр» уже выбраны, чекбокса «Данные верны» нет.
  await expect(page.getByRole("radio", { name: /Электронно/ })).toBeChecked();
  await expect(page.getByLabel("Данные верны")).toHaveCount(0);
  await tap(() => page.getByRole("button", { name: "В банк" }).click());
  await tap(() => page.getByRole("button", { name: "Отправить" }).click());
  await expect(page.getByTestId("request-success")).toBeVisible();
  expect(taps).toBe(4);
  await ctx.close();
});

test("повторная справка того же типа: форма предупреждает о заявке в работе", async ({
  browser,
  baseURL,
}) => {
  const ctx = await browser.newContext({ baseURL });
  await loginAs(ctx, "anna", baseURL!);
  const page = await ctx.newPage();
  await page.goto("/requests/new/study_cert");
  await expect(page.getByText("Такая заявка у вас уже в работе")).toBeVisible();
  await expect(page.getByRole("link", { name: /Открыть заявку СП-/ })).toBeVisible();
  // Предупреждение не запрещает подачу: поля и кнопка на месте.
  await expect(page.getByRole("button", { name: "Отправить" })).toBeEnabled();
  await ctx.close();
});
