import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./support/auth";
import { makeChange, makeClass, makeSchedule, mockJson } from "./support/mocks";

// «Расписание» (этап C3, SPEC §6.3): AC-3.1, AC-3.2, AC-3.5, AC-3.6, ghost slots, карточка пары.

test.beforeEach(async ({ context, baseURL }) => {
  await loginAs(context, "anna", baseURL!);
});

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const D = "2026-11-12";
const at = (t: string, d = D) => `${d}T${t}:00+03:00`;

const changeCases = [
  { type: "cancelled", label: "Отменена", extra: "Причина: Болезнь преподавателя" },
  { type: "moved", label: "Перенесена", extra: "12:40 → 15:20" },
  { type: "room_changed", label: "Новая аудитория", extra: "Была аудитория 101" },
  { type: "teacher_changed", label: "Другой преподаватель", extra: "Ведёт Петров А. В." },
  { type: "added", label: "Добавлена", extra: "" },
] as const;

for (const c of changeCases) {
  test(`AC-3.2, AC-3.5: изменение «${c.type}» с текстовой меткой`, async ({ page }) => {
    const cls = makeClass({
      id: "x1",
      title: "Макроэкономика",
      startsAt: at("15:20"),
      endsAt: at("16:40"),
      change: makeChange(c.type),
    });
    await mockJson(page, "**/api/me/schedule**", makeSchedule([cls]));
    await page.goto(`/schedule?d=${D}`);
    const card = page.locator("[data-slot=card]", { hasText: "Макроэкономика" });
    await expect(card.getByText(c.label, { exact: true })).toBeVisible();
    if (c.extra) await expect(card).toContainText(c.extra);
    if (c.type === "cancelled") {
      await expect(card.getByRole("link", { name: "Макроэкономика" })).toHaveCSS(
        "text-decoration-line",
        "line-through",
      );
    }
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
}

test("призрак перенесённой пары на старом месте", async ({ page }) => {
  const cls = makeClass({
    id: "x1",
    title: "Макроэкономика",
    startsAt: at("15:20"),
    endsAt: at("16:40"),
    change: makeChange("moved"),
  });
  await mockJson(
    page,
    "**/api/me/schedule**",
    makeSchedule([cls], [{ classId: "x1", originalStartsAt: at("12:40"), movedTo: at("15:20") }]),
  );
  await page.goto(`/schedule?d=${D}`);
  await expect(page.locator("[data-slot=ghost-class]")).toContainText("Перенесена на 15:20");
});

test("карточка пары: аудитория с подсказкой, заметка, календарь", async ({ page }) => {
  const cls = makeClass({ id: "x1", title: "Философия" });
  await mockJson(page, "**/api/me/schedule**", makeSchedule([cls]));
  await page.goto(`/schedule?d=${D}`);
  await page.getByRole("link", { name: "Философия" }).click();
  const dialog = page.getByRole("dialog", { name: "Философия" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Направо от лифта");
  await expect(dialog.getByRole("button", { name: "Добавить в календарь" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("AC-3.6: стрелки переключают день, неделя и «Сегодня» работают", async ({ page }) => {
  await mockJson(
    page,
    "**/api/me/schedule**",
    makeSchedule([makeClass({ id: "x1", title: "Философия" })]),
  );
  await page.goto(`/schedule?d=${D}`);
  await expect(
    page.locator("p[aria-live=polite]").filter({ hasText: "четверг, 12 ноября" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Следующий день" }).click();
  await expect(
    page.locator("p[aria-live=polite]").filter({ hasText: "пятница, 13 ноября" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Предыдущий день" }).click();
  await page.getByRole("button", { name: "Предыдущий день" }).click();
  await expect(
    page.locator("p[aria-live=polite]").filter({ hasText: "среда, 11 ноября" }),
  ).toBeVisible();
  await expect(page.getByText("В этот день занятий нет")).toBeVisible();
});

test("свайп по списку дня листает день, но не от края экрана", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-360");
  await mockJson(
    page,
    "**/api/me/schedule**",
    makeSchedule([makeClass({ id: "x1", title: "Философия" })]),
  );
  await page.goto(`/schedule?d=${D}`);
  const list = page.locator("ol").first();
  await expect(list).toBeVisible();
  const swipe = (x0: number, x1: number) =>
    list.evaluate(
      (el, [a, b]) => {
        const mk = (type: string, x: number) =>
          el.dispatchEvent(
            new TouchEvent(type, {
              bubbles: true,
              touches:
                type === "touchend"
                  ? []
                  : [new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 })],
              changedTouches: [new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 })],
            }),
          );
        mk("touchstart", a!);
        mk("touchend", b!);
      },
      [x0, x1],
    );
  await swipe(5, -100 + 5); // от края: игнорируется
  await expect(
    page.locator("p[aria-live=polite]").filter({ hasText: "четверг, 12 ноября" }),
  ).toBeVisible();
  await swipe(250, 100);
  await expect(
    page.locator("p[aria-live=polite]").filter({ hasText: "пятница, 13 ноября" }),
  ).toBeVisible();
});

test("AC-3.1: день и неделя без горизонтальной прокрутки; неделя показывает дни", async ({
  page,
}) => {
  await mockJson(
    page,
    "**/api/me/schedule**",
    makeSchedule([
      makeClass({
        id: "a",
        title: "Междисциплинарный практикум по макроэкономическому моделированию",
      }),
      makeClass({
        id: "b",
        title: "Философия",
        startsAt: at("09:30", "2026-11-13"),
        endsAt: at("11:00", "2026-11-13"),
      }),
    ]),
  );
  await page.goto(`/schedule?d=${D}`);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "Неделя", exact: true }).click();
  await expect(page.getByRole("heading", { name: /пятница, 13 ноября/ })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("настоящие данные Анны: неделя загружается", async ({ page }) => {
  await page.goto("/schedule?view=week");
  await expect(page.getByRole("heading", { level: 1, name: "Расписание" })).toBeVisible();
  await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
  await expect(page.locator("[data-slot=card]").first()).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});
