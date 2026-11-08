# Компас — правила для GLM 5.3 Flash (OpenCode)

Ты выполняешь бэкенд-тикеты из docs/DEEPSEEK-TASKS.md. Один тикет за сессию.
Источник правды о продукте — docs/SPEC.md. Контракты API — src/contracts/api.ts (не менять).

## Команды
- Проверка тикета: pnpm typecheck && pnpm lint && pnpm vitest run <тесты тикета>
- Полная проверка: pnpm verify:ds
- Сброс и сид БД: pnpm db:reset && pnpm db:seed
- Базы: ты работаешь в ../kompas-ds, тесты идут в kompas_ds_test (TEST_DATABASE_URL), сид — в kompas_ds_dev; kompas_dev и kompas_test не трогай.

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

## Типовые ошибки фазы B (ревью Claude, docs/ai-log/errors.md C1–C16)
8. Мутация статуса: сначала заблокировать строку (lockRequestRow / lockTicketRow — SELECT … FOR UPDATE), потом проверить статус, потом UPDATE.
9. Область видимости сотрудника хранится в данных и проверяется при КАЖДОМ чтении, а не только при создании и в notify. Критерии аудитории пересекаются (факультет ∧ курс ∧ группа).
10. Токены и секреты в БД — только хешем. Служебные таблицы (idempotency_keys и др.) под чужие данные не занимать. Секрет — через serverSecret(), без фолбэка в production.
11. Сначала проверка формата входа, потом лимит и запросы к БД. Ключ лимита — нормализованное значение.
12. Каждое поле из тела, которое попадает в payload (и при повторной подаче), проверяется по formSchema (requestFieldIssues).
13. POST, создающий сущность, — через withIdempotency, если манифест шлёт ключ.
14. Курсор сравнивается теми же выражениями, что и ORDER BY.
15. Выборки по времени учитывают переносы: «исходное ИЛИ новое время в диапазоне».
16. Сид согласован с правилами видимости: не создавай данных, которые никто не увидит.
17. В коде и комментариях — только русский и английский. Перед коммитом проверь, что нет иероглифов.

## Если что-то неясно
Создай docs/ds-questions/DS-XX.md и остановись. Не придумывай.
