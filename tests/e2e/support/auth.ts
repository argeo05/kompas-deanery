import { expect, type BrowserContext, type Page } from "@playwright/test";

// Вход демо-аккаунта в e2e: настоящий запрос к Better Auth, cookie попадает в контекст браузера.
// Лимит входа считается по IP (5 за 30 с), поэтому каждый вход идёт с «своего» адреса в x-real-ip
// (на e2e прокси играет сам тест, TRUSTED_PROXY=true в playwright.config.ts).

export const DEMO = {
  anna: { login: "anna.demo", password: "kompas-demo-anna" },
  maxim: { login: "maxim.demo", password: "kompas-demo-maxim" },
  elena: { login: "elena.staff", password: "kompas-demo-elena" },
} as const;

let counter = 0;
const nextIp = () => `192.0.2.${((Date.now() + counter++ * 7 + process.pid) % 250) + 1}`;

export async function loginAs(
  target: Page | BrowserContext,
  who: keyof typeof DEMO,
  baseURL: string,
  options: { onboarding?: "keep" } = {},
): Promise<void> {
  const res = await target.request.post("/api/auth/sign-in/username", {
    data: { username: DEMO[who].login, password: DEMO[who].password },
    headers: { origin: baseURL, "x-real-ip": nextIp() },
  });
  expect(res.status(), "вход демо-аккаунта").toBe(200);
  // Тур первого входа (C8) открывается поверх экрана и закрыл бы его от теста: помечаем пройденным,
  // как это сделал бы студент кнопкой «Пропустить». Сам тур проверяет tests/e2e/profile.spec.ts.
  if (who !== "elena" && options.onboarding !== "keep") {
    const done = await target.request.patch("/api/me", {
      data: { onboardingDone: true },
      headers: { origin: baseURL },
    });
    expect(done.status(), "тур отмечен пройденным").toBe(200);
  }
}
