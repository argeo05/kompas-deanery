// IP клиента для лимитов частоты (SPEC §9.7, D-005).
// Верим только одному заголовку, который перезаписывает НАШ обратный прокси (Caddy:
// `header_up X-Real-IP {remote_host}`). X-Forwarded-For, Forwarded и подобные клиент
// подставляет сам, поэтому они не читаются никогда.
//
// TRUSTED_PROXY=true значит «перед приложением стоит прокси, который перезаписывает заголовок».
// В production без него приложение не стартует (assertTrustedProxy): иначе лимиты
// ключуются подделываемым значением.

/** Имя доверенного заголовка; по умолчанию x-real-ip. */
export function ipHeaderName(): string {
  return process.env.AUTH_IP_HEADER ?? "x-real-ip";
}

/** Fail-fast: production без доверенного прокси — ошибка конфигурации. */
export function assertTrustedProxy(): void {
  if (process.env.NODE_ENV === "production" && process.env.TRUSTED_PROXY !== "true") {
    throw new Error(
      "TRUSTED_PROXY=true обязателен в production: приложение должно стоять за прокси (Caddy), " +
        "который перезаписывает заголовок с IP клиента (D-005).",
    );
  }
}

/** IP клиента из доверенного заголовка; нет заголовка → "unknown" (общий bucket, безопасная сторона). */
export function getClientIp(headers: Headers): string {
  const value = headers.get(ipHeaderName())?.trim();
  return value ? value.slice(0, 64) : "unknown";
}
