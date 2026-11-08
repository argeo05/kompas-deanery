# Компас — правила для DeepSeek (OpenCode)

Ты выполняешь бэкенд-тикеты из docs/DEEPSEEK-TASKS.md. Один тикет за сессию.
Источник правды о продукте — docs/SPEC.md. Контракты API — src/contracts/api.ts (не менять).

## Команды
- Проверка тикета: pnpm typecheck && pnpm lint && pnpm vitest run <тесты тикета>
- Полная проверка: pnpm verify:ds
- Сброс и сид БД: pnpm db:reset && pnpm db:seed

## Нельзя
- Трогать UI: src/app/**/page.tsx, layout.tsx, src/components, src/styles, public, src/sw.
- Трогать: src/contracts, src/server/auth, middleware.ts, db/schema, db/migrations, tests/security, tests/e2e, package.json, .env*, .claude, CLAUDE.md, .github.
- Менять тесты, чтобы они прошли. Ставить .skip, @ts-ignore, eslint-disable.
- Добавлять зависимости. Писать тексты интерфейса.

## Обязательно в каждом эндпоинте
1. Первая строка: requireStudent(req) или requireStaff(req).
2. userId/studentId только из сессии; из запроса — игнорировать.
3. Личные таблицы — только внутри withUserTx и с условием по владельцу.
4. Чужое или несуществующее — 404 NOT_FOUND.
5. Вход — через Zod-схему из src/server/schemas.
6. Время — через now() из src/lib/clock.ts, пояс Europe/Moscow.
7. Ответ — через ok()/fail() из src/server/http.ts и тип из src/contracts/api.ts.

## Если что-то неясно
Создай docs/ds-questions/DS-XX.md и остановись. Не придумывай.
