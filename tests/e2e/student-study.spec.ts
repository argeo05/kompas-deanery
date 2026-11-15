import { expect, test } from "@playwright/test";
import { loginAs } from "./support/auth";
import { makeCourse, makeGrades, mockJson, SESSION } from "./support/mocks";

// «Учёба» (этап C3, SPEC §6.4): AC-4.1, AC-4.3, AC-4.4, AC-4.5, шкала «98 / Отлично / A», сессия.

test.beforeEach(async ({ context, baseURL }) => {
  await loginAs(context, "anna", baseURL!);
});

const C1 = "11111111-1111-4111-8111-111111111111";

test("шкала «98 / Отлично / A» и чек-лист зачёта", async ({ page }) => {
  await mockJson(page, "**/api/me/grades", makeGrades());
  await page.goto("/study");
  await expect(page.locator("[data-slot=grade-scale]").first()).toHaveAttribute(
    "aria-label",
    "98 баллов, отлично, A",
  );
  await expect(page.getByText("Проект сдан")).toBeVisible();
  await expect(page.getByText("Условия зачёта")).toBeVisible();
});

const statuses = [
  { status: "ok", badge: "Всё в порядке", phrase: /До сессии 24 дня/, reasons: [] },
  {
    status: "risk",
    badge: "Есть риски",
    phrase: /Обратите внимание: 1 дисциплина/,
    reasons: [{ courseId: C1, reason: "NEED_OVER_70" as const }],
  },
  {
    status: "action",
    badge: "Нужно действовать",
    phrase: /Есть задолженность по 1 дисциплине/,
    reasons: [{ courseId: C1, reason: "DEBT" as const }],
  },
] as const;

for (const s of statuses) {
  test(`AC-4.1: статус «${s.status}» с причиной списком дисциплин`, async ({ page }) => {
    await mockJson(
      page,
      "**/api/me/grades",
      makeGrades({ status: { status: s.status, reasons: [...s.reasons] } }),
    );
    await page.goto("/study");
    const summary = page.getByRole("region", { name: "Итог семестра" });
    await expect(summary).toContainText(s.badge);
    await expect(summary).toContainText(s.phrase);
    if (s.reasons.length)
      await expect(summary.getByRole("link", { name: "Макроэкономика" })).toBeVisible();
  });
}

test("C11: средний балл со шкалой, в причине риска — та же цифра, что на странице дисциплины", async ({
  page,
}) => {
  const grades = makeGrades({
    status: { status: "risk", reasons: [{ courseId: C1, reason: "NEED_OVER_70" }] },
    averagePreliminary: 64.3,
  });
  grades.courses[0] = { ...grades.courses[0]!, risk: true, passNeedShare: 0.87 };
  await mockJson(page, "**/api/me/grades", grades);
  await page.goto("/study");
  const summary = page.getByRole("region", { name: "Итог семестра" });
  await expect(summary).toContainText(
    "для «удовлетворительно» нужно набрать 87% оставшихся баллов",
  );
  await expect(summary).not.toContainText("больше 70%");
  await expect(summary).toContainText("64,3");
  await expect(summary).toContainText("из 100");
});

test("AC-4.4: в интерфейсе нет данных группы и рейтинга", async ({ page }) => {
  await page.goto("/study");
  await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
  const text = (await page.locator("main").innerText()).toLowerCase();
  expect(text).not.toMatch(/по группе|рейтинг|место в группе|двойк|завал|отчисл/);
});

test("AC-4.3: чужая или несуществующая дисциплина — спокойный 404, параметр studentId игнорируется", async ({
  page,
}) => {
  await page.goto("/study/subjects/99999999-9999-4999-8999-999999999999");
  await expect(page.getByRole("heading", { name: "Такой дисциплины у вас нет" })).toBeVisible();
  const plain = await (await page.request.get("/api/me/grades")).json();
  const spoofed = await page.request.get(
    "/api/me/grades?studentId=00000000-0000-4000-8000-000000000000",
  );
  expect(spoofed.status()).toBe(200);
  expect(await spoofed.json()).toEqual(plain);
});

test("дисциплина: баллы, история, что поможет, «что если» с клавиатуры (AC-4.5)", async ({
  page,
}) => {
  await mockJson(page, `**/api/me/grades/${C1}`, makeCourse());
  await page.goto(`/study/subjects/${C1}`);
  await expect(page.getByRole("heading", { level: 1, name: "Макроэкономика" })).toBeVisible();
  await expect(page.getByText("исправлено с 7 на 8/10")).toBeVisible();
  // C11 (CW-12): одна формула — 23 из 60 оставшихся = 39%, за эссе (из 10) — не меньше 4.
  await expect(
    page.getByText(
      "«Удовлетворительно» (3): нужно набрать 39% оставшихся баллов — за «Эссе» не меньше 4 из 10.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Это прогноз, а не оценка", { exact: false })).toBeVisible();
  const slider = page.getByRole("slider", { name: /Эссе/ });
  // Ползунок стартует с минимума для «Удовлетворительно», а не с нуля («Неудовлетворительно»).
  await expect(slider).toHaveValue("4");
  await expect(
    page.locator("#whatif-title").locator("xpath=..").locator("[data-slot=grade-scale]"),
  ).toContainText("Удовлетворительно");
  await slider.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
  await expect(page.locator("output")).toContainText("10 из 10");
  // 0,4·8/10·100 + 0,6·100 = 92 → «Отлично».
  await expect(
    page.locator("#whatif-title").locator("xpath=..").locator("[data-slot=grade-scale]"),
  ).toContainText("Отлично");
});

test("сессия: даты, допуск с причиной, пустое состояние", async ({ page }) => {
  await mockJson(page, "**/api/me/session", SESSION);
  await page.goto("/study/session");
  await expect(page.getByText("Допуск есть")).toBeVisible();
  await expect(page.getByText("Допуска пока нет")).toBeVisible();
  await expect(page.getByText("Не сдан реферат")).toBeVisible();
  await page.unroute("**/api/me/session");
  await mockJson(page, "**/api/me/session", { startsOn: null, endsOn: null, items: [] });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Расписание сессии пока не опубликовано" }),
  ).toBeVisible();
});

test("пустой семестр: «Оценок пока нет»", async ({ page }) => {
  await mockJson(page, "**/api/me/grades", makeGrades({ courses: [] }));
  await page.goto("/study");
  await expect(page.getByRole("heading", { name: "Оценок пока нет" })).toBeVisible();
});
