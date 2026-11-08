import { hash, verify, type Algorithm } from "@node-rs/argon2";

// Хеш паролей — Argon2id (SPEC §9.2). Better Auth по умолчанию использует scrypt; подменяем через
// emailAndPassword.password.hash/verify. Соль (16 байт) генерирует библиотека.
//
// Параметры: рекомендация SPEC для прототипа — 64 МиБ, 3 итерации, параллелизм 1.
// Минимум OWASP — 19 МиБ / 2 / 1; ниже опускаться нельзя (проверяет tests/unit/password.test.ts).

export const ARGON2_PARAMS = {
  /** Argon2id. const enum из d.ts недоступен при isolatedModules, поэтому число. */
  algorithm: 2 as Algorithm,
  /** КиБ: 64 МиБ. */
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_PARAMS);
}

export async function verifyPassword({
  hash: encoded,
  password,
}: {
  hash: string;
  password: string;
}) {
  try {
    return await verify(encoded, password);
  } catch {
    // Повреждённый или чужой формат хеша — это «неверный пароль», а не 500.
    return false;
  }
}
