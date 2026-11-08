# Фаза C — прогресс

| Этап | Статус | Модель             | Коммиты                                               |
| ---- | ------ | ------------------ | ----------------------------------------------------- |
| C0   | done   | Opus (оркестратор) | протокол фазы C, pnpm verify, MCP context7/playwright |
| C1   | done   | Sonnet             | хеш токена, CSP/nonce, манифест без pending, аудит C1 |
| C2   | todo   | Opus               |                                                       |
| C3   | todo   | Sonnet             |                                                       |
| C4   | todo   | Sonnet             |                                                       |
| C5   | todo   | Sonnet             |                                                       |
| C6   | todo   | Sonnet             |                                                       |
| C7   | todo   | Opus               |                                                       |
| C8   | todo   | Sonnet             |                                                       |
| C9   | todo   | Sonnet             |                                                       |
| C10  | todo   | Sonnet             |                                                       |
| C11  | todo   | Opus               |                                                       |
| C12  | todo   | Sonnet             |                                                       |

<!-- Ниже каждый этап ведёт свой раздел: план, AC, открытые вопросы. -->

## C1. Безопасность: хвосты D-002

План: 1) хеш токена сессии; 2) `__Host-`; 3) лимит входа по IP и логину; 4) доверенный IP; 5) CSP с nonce и заголовки; 6) тест заголовков на трёх страницах; 7) манифест без pending/skip; 8) security-auditor и правки; 9) D-005, /security.

- ✅ Токен сессии хешируется (обёртка адаптера, тест в auth.test.ts).
- ✅ `__Host-kompas.session_token` в production (e2e).
- ✅ Лимит входа: IP 5/30 с, логин 20 неудач/час; тест на подмену X-Forwarded-For.
- ✅ CSP с nonce, HSTS, Referrer-Policy, Permissions-Policy, nosniff, frame-ancestors 'none' (e2e на `/`, 404, `/staff/requests`; гидратация без нарушений CSP).
- ✅ Манифест: 0 pending, 0 skipped (232 теста); `not-implemented.ts` + e2e на 404.
- ✅ security-auditor: 17 находок, существенные исправлены (см. D-005); ux-copy-editor: правки применены.
- ✅ D-002 закрыт (D-005); `/security` написана фактами.
- ⚠️ Открыто: `.env.example` не обновлён (нет доступа), добавить `TRUSTED_PROXY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`; при выкатке очистить `sessions`; блокировка демо-логина 20 неудачами (риск, D-005); `cacheComponents` убран ради nonce (D-005).
