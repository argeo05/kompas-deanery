// HTTP-заголовки безопасности (SPEC §9.6, D-005).
// CSP со свежим nonce на каждый запрос ставит proxy.ts; остальные заголовки одинаковы для всех
// ответов и задаются в next.config.ts (staticSecurityHeaders).

/** Nonce: 128 бит случайности, base64. Только Web Crypto (proxy работает не в Node-окружении). */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Политика CSP страницы. Скрипты — только 'self' и с nonce (без 'unsafe-inline'; 'strict-dynamic'
 * разрешает чанки, которые подгружает уже доверенный скрипт). Стили элементов — 'self' + nonce;
 * атрибуты style="" разрешены отдельно (style-src-attr): их ставят React и библиотеки
 * компонентов, а выполнить код через них нельзя.
 */
export function buildCsp(nonce: string, isDev = process.env.NODE_ENV === "development"): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Заголовки без nonce: одинаковы для страниц, API и статики. */
export const staticSecurityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Для старых браузеров, которые не понимают frame-ancestors.
  { key: "X-Frame-Options", value: "DENY" },
] as const;
