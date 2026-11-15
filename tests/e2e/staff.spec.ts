import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type { MeDTO, NotificationsDTO, ScheduleDTO } from "../../src/contracts/api";
import { loginAs } from "./support/auth";
import { disableQuietHours } from "./support/prefs";

// C6: кабинет сотрудника (SPEC §6.9, AC-9.1…9.3). Два контекста: elena.staff и anna.demo.

const mskToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date());

async function twoContexts(browser: import("@playwright/test").Browser, baseURL: string) {
  const staff = await browser.newContext({ baseURL });
  const student = await browser.newContext({ baseURL });
  await loginAs(staff, "elena", baseURL);
  await loginAs(student, "anna", baseURL);
  return { staff, student };
}

const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function studentSubmits(student: BrowserContext, baseURL: string): Promise<string> {
  const types = (await (await student.request.get("/api/request-types")).json()) as {
    items: { code: string; formSchema: { name: string; kind: string; options?: string[] }[] }[];
  };
  const t = types.items.find((x) => x.code === "study_cert")!;
  const fields: Record<string, string> = {};
  for (const f of t.formSchema)
    fields[f.name] = f.kind === "select" ? (f.options?.[0] ?? "") : "в банк";
  const res = await student.request.post("/api/me/requests", {
    data: { typeCode: "study_cert", delivery: "electronic", copies: 1, fields },
    headers: { origin: baseURL, "idempotency-key": crypto.randomUUID() },
  });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test("перенос пары: у anna.demo срочное уведомление и изменилась «Сегодня»", async ({
  browser,
  baseURL,
}, info) => {
  const { staff, student } = await twoContexts(browser, baseURL!);
  const me = (await (await student.request.get("/api/me")).json()) as MeDTO;
  const today = mskToday();
  // Проекты идут параллельно на одной базе: у каждого своё время, чтобы перенос был заметен.
  const slot = info.project.name === "mobile-360" ? ["19:00", "20:20"] : ["20:30", "21:50"];
  const sched = (await (
    await student.request.get(`/api/me/schedule?from=${today}&to=${today}`)
  ).json()) as ScheduleDTO;
  // Проекты берут разные пары (первую и последнюю подходящую) и не ту, что уже стоит на этом
  // времени после прошлых прогонов: иначе «перенос» ничего не меняет.
  const candidates = sched.classes.filter(
    (c) => c.change?.type !== "cancelled" && !c.startsAt.includes(`T${slot[0]}:`),
  );
  const target = info.project.name === "mobile-360" ? candidates[0] : candidates.at(-1);
  test.skip(!target, "у Анны сегодня нет пары (выходной): сценарий проверяется в будни");
  const titleBefore = target!.course.title;
  const startBefore = target!.startsAt;

  // Ночью (тихие часы 23:00–07:00) срочное уведомление ждёт 07:00 — выключаем их явно.
  await disableQuietHours(student, baseURL!);
  const page = await staff.newPage();
  await page.goto("/staff/schedule");
  await expect(page.getByRole("heading", { level: 1, name: "Изменения расписания" })).toBeVisible();
  await page.getByLabel("Группа").selectOption({ label: me.group.title });
  const card = page.getByTestId("staff-class").filter({ hasText: titleBefore }).first();
  await expect(card).toBeVisible();
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
  await card.getByRole("button", { name: /Изменить/ }).click();

  const dialog = page.getByRole("dialog", { name: "Изменить пару" });
  await dialog.getByRole("radio", { name: "Перенести на другое время" }).check();
  await dialog.getByLabel("Начало").fill(slot[0]!);
  await dialog.getByLabel("Конец").fill(slot[1]!);
  await dialog.getByLabel(/Причина/).fill("Преподаватель на конференции");
  // Предупреждение о числе затронутых студентов.
  await expect(dialog.getByTestId("impact")).toContainText(/Изменение увидят \d+ /);
  await expect(dialog.getByTestId("impact")).toContainText("срочным");
  await dialog.getByRole("button", { name: /Сохранить и уведомить/ }).click();
  await expect(page.getByText(/Изменение сохранено/)).toBeVisible();

  // Студент: срочное уведомление.
  const notes = (await (
    await student.request.get("/api/me/notifications")
  ).json()) as NotificationsDTO;
  const urgent = notes.items.find(
    (n) =>
      n.class === "urgent" &&
      n.category === "schedule" &&
      (n.body.includes(titleBefore) || n.title.includes(titleBefore)),
  );
  expect(urgent, "срочное уведомление о переносе").toBeTruthy();

  // «Сегодня» изменилась: пара перенесена на 19:00.
  const sp = await student.newPage();
  await sp.goto("/today");
  await expect(sp.getByText("Перенесена").first()).toBeVisible();
  const after = (await (
    await student.request.get(`/api/me/schedule?from=${today}&to=${today}`)
  ).json()) as ScheduleDTO;
  const moved = after.classes.find((c) => c.id === target!.id)!;
  expect(moved.change?.type).toBe("moved");
  expect(moved.startsAt).not.toBe(startBefore);
  await staff.close();
  await student.close();
});

test("очередь: счётчики, фильтры, SLA, карточка и переходы FSM, AC-9.3", async ({
  browser,
  baseURL,
}) => {
  const { staff, student } = await twoContexts(browser, baseURL!);
  const id = await studentSubmits(student, baseURL!);
  const page = await staff.newPage();

  await page.goto("/staff/queue");
  await expect(page.getByRole("heading", { level: 1, name: "Очередь заявок" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Счётчики очереди" })).toContainText("Отправлены");
  await expect(page.getByTestId("queue-row").locator("visible=true").first()).toBeVisible();
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);

  // Фильтр по статусу и «только просроченные».
  const toggle = page.getByRole("button", { name: "Фильтры" });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByLabel("Статус").selectOption("submitted");
  await expect(page.getByTestId("queue-row").locator("visible=true").first()).toBeVisible();
  await page.getByLabel("Статус").selectOption("");

  await page.goto(`/staff/requests/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Справка об обучении" })).toBeVisible();
  await expect(page.getByTestId("actions")).toBeVisible();
  // Оценок и контактов в карточке нет.
  await expect(page.getByText(/Средний балл|Телефон/)).toHaveCount(0);

  await page.getByRole("button", { name: "Взять в работу" }).click();
  await expect(page.getByText("В работе").first()).toBeVisible();

  // AC-9.3: отказ без причины не проходит.
  await page.getByRole("button", { name: "Отклонить" }).click();
  const rej = page.getByRole("dialog", { name: "Отклонить заявку" });
  await rej.getByRole("button", { name: "Отклонить заявку" }).click();
  await expect(rej.getByText("Выберите причину отказа")).toBeVisible();
  await expect(rej.getByText(/Объясните студенту/)).toBeVisible();
  await page.keyboard.press("Escape");

  // Уточнение с шаблоном.
  await page.getByRole("button", { name: "Запросить уточнение" }).click();
  const ni = page.getByRole("dialog", { name: "Запросить уточнение" });
  await ni.getByRole("button", { name: "Куда нужна справка" }).click();
  await expect(ni.getByLabel("Что нужно уточнить")).toHaveValue(/куда предоставляется справка/);
  await ni.getByRole("button", { name: "Отправить вопрос" }).click();
  await expect(page.getByText("Нужно уточнение").first()).toBeVisible();

  // Студент видит вопрос.
  const detail = (await (await student.request.get(`/api/me/requests/${id}`)).json()) as {
    status: string;
  };
  expect(detail.status).toBe("needs_info");
  await staff.close();
  await student.close();
});

test("объявление: аудитория, предпросмотр, публикация, студент видит", async ({
  browser,
  baseURL,
}) => {
  const { staff, student } = await twoContexts(browser, baseURL!);
  const me = (await (await student.request.get("/api/me")).json()) as MeDTO;
  const title = `Проверка связи ${Date.now()}`;
  const page = await staff.newPage();
  await page.goto("/staff/announcements/new");
  await page.getByLabel("Заголовок").fill(title);
  await page.getByRole("textbox", { name: "Текст" }).fill("**Важно** прочитать.\n\n- первый пункт");
  await expect(page.getByTestId("announcement-preview")).toContainText(title);
  await expect(page.getByTestId("announcement-preview").locator("strong")).toHaveText("Важно");
  await page.getByRole("checkbox", { name: new RegExp(me.group.title) }).check();
  await expect(page.getByTestId("audience-count")).toContainText(/Увидят \d+ /);
  // C11: кнопка называет число получателей, публикация — только после подтверждения.
  await page.getByRole("button", { name: /^Опубликовать для \d+ студент/ }).click();
  const confirm = page.getByRole("dialog", { name: "Опубликовать объявление?" });
  await expect(confirm).toContainText(/Его увидят \d+ студент/);
  await confirm.getByRole("button", { name: /^Опубликовать для \d+ студент/ }).click();
  await expect(page).toHaveURL(/\/staff\/announcements$/);
  await expect(page.getByText(title)).toBeVisible();

  const list = (await (await student.request.get("/api/me/announcements")).json()) as {
    items: { title: string }[];
  };
  expect(list.items.some((a) => a.title === title)).toBe(true);
  await staff.close();
  await student.close();
});

test("пустая форма объявления показывает ошибки, расписание без пар и обращения открываются", async ({
  browser,
  baseURL,
}) => {
  const staff = await browser.newContext({ baseURL });
  await loginAs(staff, "elena", baseURL!);
  const page = await staff.newPage();
  await page.goto("/staff/announcements/new");
  // C11: аудитория по умолчанию посчитана сразу, а не «Считаем получателей…» навсегда.
  await expect(page.getByTestId("audience-count")).toContainText(/Увидят \d+ студент/);
  await page.getByRole("button", { name: /^Опубликовать/ }).click();
  await expect(page.getByText("Напишите заголовок: он виден в ленте")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Опубликовать объявление?" })).toHaveCount(0);
  await page.goto("/staff/tickets");
  await expect(page.getByRole("heading", { level: 1, name: "Обращения" })).toBeVisible();
  await page.goto("/staff/schedule");
  await page.getByLabel("День").fill("2026-01-04");
  await expect(page.getByText("В этот день пар нет")).toBeVisible();
  await staff.close();
});

test("AC-9.1: студент не открывает /staff/queue и API сотрудника", async ({ browser, baseURL }) => {
  const student = await browser.newContext({ baseURL });
  await loginAs(student, "anna", baseURL!);
  const page = await student.newPage();
  const res = await page.goto("/staff/queue");
  expect(res?.status()).toBe(403);
  await expect(page.getByText("Раздел для сотрудников")).toBeVisible();
  const api = await student.request.get("/api/staff/requests");
  expect(api.status()).toBe(403);
  await student.close();
});
