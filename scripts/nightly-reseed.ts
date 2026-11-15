import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema";
import { truncateAndSeed } from "../db/seed/reset-demo";

// Ночной пересев демо-данных (SPEC §8.3, D-017): запускается cron в 04:00 МСК, даты в сиде
// пересчитываются от сегодняшнего дня. Все сеансы закрываются. Счётчики rate_limits сохраняются.
// Запуск: pnpm reseed:nightly (в проде — scripts/deploy/reseed.sh через образ tools).
if (process.env.DEMO_RESET_ENABLED === "false") {
  console.log("DEMO_RESET_ENABLED=false — пересев пропущен");
  process.exit(0);
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL не задан");

const client = postgres(url, { max: 1, onnotice: () => {} });
const started = Date.now();
try {
  const db = drizzle(client, { schema });
  await truncateAndSeed(db);
  // Окна демо-сброса старше суток больше не нужны (rate_limits сброс не чистит).
  await client`DELETE FROM rate_limits WHERE key LIKE 'kompas:%' AND last_request < ${Date.now() - 86_400_000}`;
  console.log(`Пересев готов за ${((Date.now() - started) / 1000).toFixed(1)} с`);
} finally {
  await client.end();
}
