# Сторонние материалы и лицензии (SPEC §10.8, C-21)

Разрешены MIT, ISC, Apache-2.0, BSD, OFL. Исключения отмечены и обоснованы.
Добавляя зависимость, допишите строку сюда в том же коммите.

## Зависимости приложения

| Пакет                      | Версия | Лицензия   | Зачем                                                                                        |
| -------------------------- | ------ | ---------- | -------------------------------------------------------------------------------------------- |
| next                       | 16.4.5 | MIT        | Фреймворк                                                                                    |
| react, react-dom           | 19.3.0 | MIT        | UI                                                                                           |
| better-auth                | 1.7.18 | MIT        | Вход по логину, сессии в БД, rate limit (SPEC §6.1 п.9, §10.9)                               |
| @node-rs/argon2            | 2.2.2  | MIT        | Хеш паролей Argon2id (SPEC §9.2)                                                             |
| drizzle-orm                | 0.45.4 | Apache-2.0 | ORM                                                                                          |
| postgres                   | 4.1.0  | Unlicense  | Драйвер PostgreSQL. Unlicense — передача в общественное достояние, мягче MIT. Исключение     |
| zod                        | 4.6.7  | MIT        | Валидация входа                                                                              |
| radix-ui                   | 1.8.1  | MIT        | Примитивы UI (shadcn)                                                                        |
| class-variance-authority   | 0.7.1  | Apache-2.0 | Варианты компонентов                                                                         |
| cn                         | 0.5.2  | MIT        | Склейка классов (shadcn)                                                                     |
| lucide-react               | 1.70.0 | ISC        | Иконки                                                                                       |
| tw-animate-css             | 1.4.0  | MIT        | Анимации Tailwind                                                                            |
| server-only                | 0.0.1  | MIT        | Защита серверных модулей от попадания в бандл                                                |
| ics                        | 3.12.1 | ISC        | Экспорт расписания и дедлайнов в ICS (DS-22)                                                 |
| rate-limiter-flexible      | 11.4.0 | ISC        | Лимиты частоты для /api/verify, сообщений и заявок (SPEC §9.7)                               |
| @faker-js/faker            | 10.6.0 | MIT        | Вымышленные ФИО фоновой популяции сида, локаль ru (DS-40). Сид работает и в production       |
| @fontsource-variable/onest | 5.3.1  | OFL-1.1    | Шрифт Onest (вариативный), кириллица и латиница из репозитория, без Google Fonts (SPEC §7.2) |
| @fontsource/unbounded      | 5.3.0  | OFL-1.1    | Шрифт Unbounded 600 для H1 главной и крупных цифр (SPEC §7.2)                                |
| Onest (статические TTF)    | 5.3.1  | OFL-1.1    | Шрифт PDF справок: latin + cyrillic в одном файле, `src/server/pdf/fonts`, лицензия OFL.txt |
| @react-pdf/renderer        | 4.9.0  | MIT        | PDF справок на сервере (SPEC §6.5 п.8)                                                       |
| qrcode                     | 1.5.4  | MIT        | QR-код проверки подлинности в PDF (SPEC §6.5 п.9)                                            |

## Инструменты разработки

| Пакет                                              | Лицензия     | Зачем                                                         |
| -------------------------------------------------- | ------------ | ------------------------------------------------------------- |
| typescript                                         | Apache-2.0   | Типы                                                          |
| drizzle-kit                                        | MIT          | Миграции                                                      |
| vitest, @vitejs/plugin-react                       | MIT          | Unit / integration / security                                 |
| @playwright/test                                   | Apache-2.0   | E2E                                                           |
| @axe-core/playwright                               | MPL-2.0      | Проверка доступности. Исключение: только в тестах, SPEC §10.9 |
| eslint, eslint-config-next, eslint-config-prettier | MIT          | Линтер                                                        |
| prettier, prettier-plugin-tailwindcss              | MIT          | Форматирование                                                |
| tailwindcss, @tailwindcss/turbopack                | MIT          | Стили                                                         |
| shadcn                                             | MIT          | Генератор компонентов                                         |
| tsx                                                | MIT          | Скрипты db/\*                                                 |
| dotenv                                             | BSD-2-Clause | .env для скриптов и тестов                                    |
| ical.js                                            | MPL-2.0      | Разбор ICS в тестах DS-22. Исключение: только в тестах        |
| @types/node, @types/react, @types/react-dom        | MIT          | Типы                                                          |
| @types/qrcode                                      | MIT          | Типы для qrcode                                               |
