// Витрина /dev/ui (этап C2) открыта только в разработке. Для e2e на production-сборке её включает
// KOMPAS_DEV_UI=true (playwright.config.ts); в окружении хостинга переменной нет — витрина отвечает 404.
export function devUiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "development" || env.KOMPAS_DEV_UI === "true";
}
