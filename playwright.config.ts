import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

// Проекты по SPEC §12.4: мобильный 360×740 (основной) и десктоп 1440×900.
// Сервер — production-сборка (standalone), чтобы e2e проверяли то же, что поедет в Docker.
export default defineConfig({
  testDir: "tests",
  testMatch: ["e2e/**/*.spec.ts", "a11y/**/*.spec.ts"],
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    trace: "retain-on-failure",
    // Service worker включаем только там, где проверяем офлайн (tests/e2e/offline.spec.ts):
    // иначе каждый тест ставит SW и фоново сохраняет офлайн-набор, а моки page.route видят не всё.
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "mobile-360",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 360, height: 740 },
      },
    },
    {
      name: "desktop-1440",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    command: `pnpm build && node scripts/start-standalone.mjs`,
    url: baseURL,
    // TRUSTED_PROXY: production-сборка без доверенного прокси не стартует (D-005); здесь прокси играет сам тест.
    env: {
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      TRUSTED_PROXY: "true",
      // Витрина /dev/ui на production-сборке открыта только для e2e и скриншотов (src/lib/dev-ui.ts).
      KOMPAS_DEV_UI: "true",
      // Помощник «Спросить Компас» включён только для e2e; в production флаг выключен (D-016). Ключа провайдера нет.
      AI_ASSISTANT: "true",
      AI_DAILY_LIMIT: "1000",
      // Секрет только для e2e; в production задаётся окружением хостинга.
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ?? "e2e-only-insecure-secret-do-not-use-in-prod",
      BETTER_AUTH_URL: baseURL,
      // Секрет кодов проверки справок (/verify): в production обязателен, без него выдача документа падает.
      VERIFY_SECRET: process.env.VERIFY_SECRET ?? "e2e-only-insecure-verify-secret",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
