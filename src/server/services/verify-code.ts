import { createHash } from "node:crypto";

// Публичный код проверки подлинности документа (DS-19, DS-23; SPEC §6.5 п.9, §9.7).
//
// В БД хранится ТОЛЬКО его SHA-256 (documents.verify_token_hash, db/schema/requests.ts),
// поэтому эндпоинт /api/verify/:code ищет документ по docTokenHash(показанного кода).
// Сам код не хранится и не читается из БД — он однократно выводится из id документа
// и секрета, поэтому один и тот же verifyUrl можно построить повторно (список DS-19,
// QR в PDF — Claude):
//
//   PUBLIC_CODE(doc)     = sha256(`${VERIFY_SECRET}:${doc.id}`)   → 64 hex, идёт после /verify/
//   VERIFY_TOKEN_HASH     = sha256(PUBLIC_CODE)                   → 64 hex, хранится в БД
//
// VERIFY_SECRET — process.env.VERIFY_SECRET. Демо-секрет — только вне production: на стенде
// без переменной коды справок и ICS-токены вычислялись бы по публичной строке (ревью DS-23).
// ВАЖНО: сид (db/seed/population.ts) и файловый эндпоинт Claude обязаны использовать
// только эти функции — иначе ссылки из DS-19 перестанут открываться.
//
// Файл чистый: без «server-only», чтобы его импортировал сид (tsx db/seed).

/** Серверный секрет кодов (справки DS-19/23, ICS DS-22). Читается при вызове, не при импорте:
 * иначе `next build` падал бы на сборке без переменных окружения. */
export function serverSecret(): string {
  const secret = process.env.VERIFY_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("VERIFY_SECRET не задан");
  return "demo-secret";
}

/** Публичный код документа для ссылки /verify/<code>. Детерминирован и восстанавливаем. */
export function docPublicCode(docId: string): string {
  return createHash("sha256").update(`${serverSecret()}:${docId}`).digest("hex");
}

/** Значение documents.verify_token_hash: SHA-256 публичного кода. */
export function docTokenHash(publicCode: string): string {
  return createHash("sha256").update(publicCode).digest("hex");
}
