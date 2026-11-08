import { expect, test, type Page } from "@playwright/test";

// Оболочка и дизайн-система (этап C2, SPEC §5.2–5.5, §7.4, §7.7) на витрине /dev/ui.

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 1024;

test.beforeEach(async ({ page }) => {
  const res = await page.goto("/dev/ui");
  expect(res?.status()).toBe(200);
});

test("витрина без горизонтальной прокрутки и без нарушений CSP", async ({ page }) => {
  const csp: string[] = [];
  page.on("console", (m) => {
    if (/content security policy/i.test(m.text())) csp.push(m.text());
  });
  await page.reload();
  // networkidle недостижим из-за prefetch ссылок (см. security-headers.spec.ts).
  await page.waitForLoadState("load");
  await page.waitForTimeout(500);
  await expect(page.getByRole("heading", { level: 1, name: "Витрина интерфейса" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  expect(csp).toEqual([]);
});

test("навигация: нижняя панель на мобильной, боковая на десктопе", async ({ page }) => {
  const bottom = page.getByRole("navigation", { name: "Основные разделы", exact: true });
  const side = page.getByRole("navigation", { name: "Разделы", exact: true });
  if (isMobile(page)) {
    await expect(bottom).toBeVisible();
    await expect(side).toBeHidden();
    // Пять пунктов: четыре раздела и «Ещё».
    await expect(bottom.getByRole("listitem")).toHaveCount(5);
    await expect(bottom.getByRole("link", { name: /Учёба/ })).toHaveAccessibleName(
      /дедлайнов в ближайшие 48 часов: 2/,
    );
  } else {
    await expect(side).toBeVisible();
    await expect(bottom).toBeHidden();
    await expect(side.getByRole("link", { name: /Уведомления/ })).toBeVisible();
  }
});

test("лист «Ещё»: открывается, держит фокус, закрывается по Esc и возвращает фокус", async ({
  page,
}) => {
  test.skip(!isMobile(page), "«Ещё» есть только в нижней панели");
  const more = page.getByRole("button", { name: /Ещё/ });
  await more.click();
  const sheet = page.getByRole("dialog", { name: "Ещё" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Связь с деканатом" })).toBeVisible();
  await expect(sheet.getByRole("radio", { name: "Тёмная" })).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(more).toBeFocused();
});

test("skip-link — первая цель Tab и ведёт к содержимому", async ({ page }) => {
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Перейти к содержимому" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#content")).toBeFocused();
});

test("переключатель темы меняет тему и запоминает её", async ({ page }) => {
  if (isMobile(page)) await page.getByRole("button", { name: /Ещё/ }).click();
  await page.getByText("Тёмная", { exact: true }).locator("visible=true").first().click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(15, 20, 32)");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("цели касания в оболочке не меньше 44×44 px", async ({ page }) => {
  test.skip(!isMobile(page), "требование для мобильной (SPEC §7.4)");
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("header a, header button, nav a, nav button, header input")]
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width < 44 || r.height < 44)
      .map(
        ({ el, r }) =>
          `${el.textContent?.trim() || el.getAttribute("aria-label")}: ${r.width}×${r.height}`,
      ),
  );
  expect(small).toEqual([]);
});

test("toast озвучивается и закрывается кнопкой", async ({ page }) => {
  await page.getByRole("button", { name: "Показать success" }).click();
  const status = page.getByRole("status").filter({ hasText: "Заявка отправлена" });
  await expect(status).toBeVisible();
  await status.getByRole("button", { name: "Закрыть уведомление" }).click();
  await expect(page.getByText("Заявка отправлена")).toBeHidden();
});

test("404 на русском и с действием", async ({ page }) => {
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Такой страницы нет" })).toBeVisible();
  await expect(page.getByRole("link", { name: "На главную" })).toBeVisible();
});

test("на 320 px нет горизонтальной прокрутки и подписи панели не обрезаны (WCAG 1.4.10)", async ({
  page,
}) => {
  test.skip(!isMobile(page), "перекомпоновка проверяется на мобильной");
  await page.setViewportSize({ width: 320, height: 640 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const clipped = await page
    .getByRole("navigation", { name: "Основные разделы", exact: true })
    .evaluate((nav) =>
      [...nav.querySelectorAll("a > span:not(.sr-only), button > span:not(.sr-only)")]
        .filter((s) => s.scrollWidth > s.clientWidth + 1)
        .map((s) => s.textContent),
    );
  expect(clipped).toEqual([]);
});

// AC-NAV.1 (SPEC §7.5): подписи нижней панели студента не обрезаются и не переносятся
// на 360×740 при масштабе текста 125% в обеих темах.
for (const scheme of ["light", "dark"] as const) {
  test(`AC-NAV.1: подписи нижней панели помещаются при тексте 125%, тема ${scheme}`, async ({
    page,
  }) => {
    test.skip(!isMobile(page), "нижняя панель только на мобильной");
    await page.emulateMedia({ colorScheme: scheme });
    // 125% от базового размера: все rem растут, как при настройке «крупный текст».
    await page.evaluate(() => document.documentElement.style.setProperty("font-size", "125%"));
    const bottom = page.getByRole("navigation", { name: "Основные разделы", exact: true });
    const labels = bottom.locator("a .type-nav, button .type-nav");
    await expect(labels).toHaveCount(5);
    const texts = await labels.allTextContents();
    expect(texts.map((t) => t.trim())).toEqual(["Сегодня", "Пары", "Учёба", "Заявки", "Ещё"]);
    const metrics = await labels.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        const lh = parseFloat(getComputedStyle(el).lineHeight);
        return {
          text: el.textContent,
          clipped: el.scrollWidth > el.clientWidth,
          // Одна строка: высота блока не больше одной строки с запасом на округление.
          lines: Math.round(r.height / lh),
          overflowsCell: r.width > (el.closest("li")?.getBoundingClientRect().width ?? 0),
        };
      }),
    );
    for (const m of metrics) {
      expect(m, `подпись «${m.text}»`).toMatchObject({
        clipped: false,
        lines: 1,
        overflowsCell: false,
      });
    }
    // Доступное имя начинается с видимой подписи (2.5.3) и содержит полное имя пункта.
    await expect(bottom.getByRole("link", { name: /^Пары, расписание/ })).toBeVisible();
  });
}
