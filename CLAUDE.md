# Компас — ЛК студента (концепт для конкурса)

Спецификация: docs/SPEC.md (источник истины, ≈2400 строк — ищи раздел через `grep -n '^##' docs/SPEC.md`, целиком не читай). Решения: docs/DECISIONS.md.
Перед работой над фичей прочитай её раздел в SPEC.md и критерии приёмки (AC-…).

# Команды

- Установка: pnpm install (pnpm 12; build-скрипты пакетов разрешаются в pnpm-workspace.yaml → allowBuilds)
- Dev: pnpm dev (нужен Docker: pnpm db:up; .env — из .env.example)
- Миграции и сид: pnpm db:migrate && pnpm db:seed · сброс: pnpm db:reset · новая миграция: pnpm db:generate
- Типы: pnpm typecheck · линт + формат: pnpm lint
- Юнит: pnpm test:unit · один файл: pnpm vitest run path/to/file.test.ts
- Базы (D-004): kompas_dev — DATABASE_URL (приложение), kompas_test — TEST_DATABASE_URL (только тесты; совпадение с DATABASE_URL → отказ). pnpm db:up досоздаёт базы
- Интеграционные (нужна БД): pnpm test:integration
- Безопасность (IDOR/роли): pnpm test:security
- E2E + axe: pnpm test:e2e · мобильный проект: pnpm test:e2e --project=mobile-360 · только axe: pnpm test:a11y
- Скриншоты экранов: pnpm shots (кладёт в docs/process/shots/)
- Проверка для DeepSeek: pnpm verify:ds
- Worktree DeepSeek: scripts/ds-worktree.sh DS-XX → ../kompas-ds, ветка ds/DS-XX, базы kompas_ds_*
- Приняли тикет DS-01…07 → удалить его строку в .claude/ds-pending.txt (исключения Stop-хука)
- Новый маршрут DS уже есть в tests/security/manifest.ts (pending); принят — снять `pending`

# Неочевидные правила

- Данные только вымышленные. Никаких реальных ФИО, почт, телефонов.
- Для роли student userId берётся ТОЛЬКО из сессии. Параметры studentId/userId из запроса игнорируются.
- Чужой ресурс → 404 (не 403).
- Доступ к БД — только через src/server/repositories. Каждая выборка личных данных содержит условие по владельцу.
- Время показываем в Europe/Moscow.
- Цвета только через токены (src/styles/tokens.css). Цели касания ≥ 44px.
- Каждый экран: состояния loading / empty / error / offline.
- Тексты интерфейса: на «вы», без канцелярита; глоссарий в SPEC.md §7.6.
- Не добавляй зависимости без записи в LICENSES.md (разрешены MIT/ISC/Apache-2.0/BSD/OFL).
- AGENTS.md и opencode.json — правила DeepSeek (дословно из docs/DEEPSEEK-TASKS.md, прил. A/B). Не путать с этим файлом.

# Подводные камни

- Сид строит даты относительно сегодняшнего дня (db/seed/dates.ts) — не хардкодь даты.
- Service worker не кэширует HTML авторизованных страниц.
- Next 16: в next.config стоит `agentRules: false`, иначе `next dev` дописывает свой блок в AGENTS.md.
- `output: "standalone"` → `next start` не работает; pnpm start и Playwright запускают scripts/start-standalone.mjs.
- `cn` импортируется из npm-пакета `cn` (новый shadcn), а не из clsx + tailwind-merge.
- e2e собирают production-билд (≈30 с); локально уже запущенный сервер на :3100 переиспользуется.

# Протокол фазы C

Задачи: docs/PHASE-C-PROMPTS.md. Состояние и план: docs/ai-log/PROGRESS-C.md (ведёшь сам).

- Перед кодом: прочитай указанные в этапе §SPEC и AC. Запиши план из 5–10 пунктов в PROGRESS-C.md под заголовком этапа.
- UI только на токенах §7.2 (src/styles/tokens.css) и компонентах из src/components/ui. Сырые цвета, px-размеры и произвольные отступы запрещены. Нет нужного компонента → добавь его в src/components/ui.
- После каждого экрана: скриншоты на 360 и 1440, светлая и тёмная тема (Playwright MCP; если он недоступен — скрипт Playwright или pnpm shots). Сам сравни с §7.5 и исправь расхождения до коммита.
- Тексты по §7.6 и глоссарию. Новые строки интерфейса прогони через агента ux-copy-editor.
- Изменения в src/server/** и src/app/api/** → агент security-auditor. Изменения UI → a11y-auditor.
- Человеку вопросов не задаёшь. Неясность решай в пользу критериев конкурса, решение записывай в docs/DECISIONS.md (D-xxx).
- Definition of done этапа:
  - pnpm verify зелёный;
  - e2e своего сценария зелёные на mobile-360 и desktop-1440;
  - axe без нарушений (pnpm test:a11y);
  - AC этапа отмечены в PROGRESS-C.md (✅ / ⚠️ с причиной).
- Коммит на каждый логический шаг, сообщения на русском в стиле истории.
- В конце сессии допиши 5 строк в docs/ai-log/<дата>.md: что сделано, где ИИ ошибся, как поймали.
