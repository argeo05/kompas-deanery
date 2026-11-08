# Журнал решений (ADR-лайт)

Формат: дата · решение · почему · альтернативы · последствия.

## 2026-11-08 · D-001 · Стек и инструменты каркаса

**Решение.** Стек по SPEC §10.2:

| Слой              | Выбор                                                                                                        | Версия                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| Фреймворк         | Next.js App Router, TypeScript strict, `src/`                                                                | Next 16.4.5, React 19.3, TS 5.9 |
| Пакетный менеджер | pnpm                                                                                                         | 12.18                           |
| UI                | Tailwind CSS 4 + shadcn/ui (стиль `radix-nova`, Radix UI) + Lucide                                           | shadcn 4.23                     |
| БД / ORM          | PostgreSQL 16 (docker-compose) + Drizzle ORM (драйвер `postgres`), миграции drizzle-kit                      | drizzle-orm 0.45, kit 0.31      |
| Валидация         | Zod                                                                                                          | 4.6                             |
| Тесты             | Vitest (проекты unit / integration / security), Playwright (mobile-360, desktop-1440) + @axe-core/playwright | Vitest 5.1, Playwright 1.65     |
| Качество          | ESLint 9 (next + prettier), Prettier, `tsc --noEmit`, gitleaks (pre-commit и CI)                             | gitleaks 8.30                   |
| Контейнер         | Docker multi-stage, `output: "standalone"`, node:24-alpine                                                   | —                               |

**Почему.**

- Next.js: SSR для быстрого LCP на телефоне, API и UI в одном проекте, модели хорошо знают фреймворк (SPEC §10.1).
- Drizzle, а не Prisma: ближе к SQL, удобнее для RLS и `SET LOCAL app.user_id` в `withUserTx` (SPEC §10.2, DEEPSEEK-TASKS §2).
- Radix, а не Base UI: `shadcn init -d` теперь по умолчанию ставит `base-nova` (Base UI), а SPEC §10.2 называет Radix. Переинициализировали с `-b radix -p nova`.
- Три Vitest-проекта, чтобы Stop-хук гонял только быстрые unit и security, а интеграционные с БД шли в `verify:ds`.
- Playwright гоняет production-сборку (standalone): e2e проверяют то же, что попадёт в Docker.

**Мелкие решения каркаса.**

- `agentRules: false` в next.config: Next 16 иначе пишет свой блок в AGENTS.md, а там лежат правила DeepSeek.
- pnpm 12 блокирует build-скрипты пакетов. Разрешён только `esbuild` (`pnpm-workspace.yaml → allowBuilds`).
- `"type": "module"` в package.json: ESM-конфиги без предупреждений, top-level await в `db/*.ts`.
- Пункт §12.3 «PreToolUse на `git commit` → gitleaks» закрыт git-хуком `.githooks/pre-commit`. Он ловит любой коммит, от Claude, DeepSeek и человека, поэтому отдельный хук Claude не нужен.
- PostToolUse-хук запускает Prettier и ESLint по файлу (§12.3). В C.5 указан только Prettier, ESLint добавлен по таблице §12.3.

**Последствия.** Node ≥ 24. Для e2e нужен `pnpm exec playwright install chromium`, для интеграционных тестов — `pnpm db:up`.
