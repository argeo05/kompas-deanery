import "server-only";
import { truncateAndSeed } from "@db/seed/reset-demo";
import { now } from "@/lib/clock";
import { getDb } from "../db";
import { claimWindow, releaseWindow } from "../repositories/rate-limits";

// Сброс демо-данных (SPEC §6.1 «Тонкости», §6.9 п.6, §6.12, D-015, D-017). Вся база Компаса — вымышленные
// данные, поэтому сброс возвращает её целиком к сиду: даты пересчитываются от сегодняшнего дня.
// Все сеансы закрываются — входить нужно заново (пароли демо-аккаунтов публичны на /jury).

const WINDOW_MS = 300_000;
/** Не чаще раза в 5 минут на весь сервис: сброс общий для всех, второй подряд бессмыслен. */
const GLOBAL_KEY = "kompas:demo-reset:global";
/** И не чаще раза в 5 минут с одного адреса — чтобы один посетитель не занимал окно у остальных. */
const ipKey = (ip: string) => `kompas:demo-reset:ip:${ip}`;

export type ResetResult = { ok: true; resetAt: string } | { ok: false; retryAfterSec: number };

let running: Promise<void> | null = null;

export async function resetDemoData(ip: string): Promise<ResetResult> {
  const db = getDb();
  const t = now().getTime();
  // Лимиты лежат в БД (rate_limits): переживают перезапуск и общие для всех экземпляров.
  const byIp = await claimWindow(db, ipKey(ip), WINDOW_MS, t);
  if (!byIp.ok) return { ok: false, retryAfterSec: Math.ceil(byIp.retryAfterMs / 1000) };
  const global = await claimWindow(db, GLOBAL_KEY, WINDOW_MS, t);
  if (!global.ok) {
    await releaseWindow(db, ipKey(ip));
    return { ok: false, retryAfterSec: Math.ceil(global.retryAfterMs / 1000) };
  }
  running ??= truncateAndSeed(db).finally(() => {
    running = null;
  });
  try {
    await running;
  } catch (e) {
    // Сброс упал: окно не сжигаем, чтобы можно было повторить.
    await releaseWindow(db, ipKey(ip));
    await releaseWindow(db, GLOBAL_KEY);
    throw e;
  }
  return { ok: true, resetAt: now().toISOString() };
}

/** Для тестов: сбросить счётчики лимитов. */
export async function __resetLimits(ip: string) {
  await releaseWindow(getDb(), ipKey(ip));
  await releaseWindow(getDb(), GLOBAL_KEY);
}
