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
// VERIFY_SECRET — process.env.VERIFY_SECRET; без переменной используется демо-секрет.
// ВАЖНО: сид (db/seed/population.ts) и файловый эндпоинт Claude обязаны использовать
// только эти функции — иначе ссылки из DS-19 перестанут открываться.
//
// Файл чистый: без «server-only», чтобы его импортировал сид (tsx db/seed).

const SECRET = process.env.VERIFY_SECRET ?? "demo-secret";

/** Публичный код документа для ссылки /verify/<code>. Детерминирован и восстанавливаем. */
export function docPublicCode(docId: string): string {
  return createHash("sha256").update(`${SECRET}:${docId}`).digest("hex");
}

/** Значение documents.verify_token_hash: SHA-256 публичного кода. */
export function docTokenHash(publicCode: string): string {
  return createHash("sha256").update(publicCode).digest("hex");
}
