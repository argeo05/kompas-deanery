# Компас — личный кабинет студента

Концепт для MGIMO AI Challenge 2026, номинация «Вайб-кодинг». Спецификация — [docs/SPEC.md](docs/SPEC.md), решения — [docs/DECISIONS.md](docs/DECISIONS.md).

## Запуск

Нужны Node ≥ 24, pnpm 12, Docker.

```bash
pnpm install
cp .env.example .env   # заполнить значения
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm dev               # http://localhost:3000
```

## Проверки

```bash
pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:security
pnpm test:integration                 # нужна БД
pnpm exec playwright install chromium # один раз
pnpm test:e2e                         # mobile-360 и desktop-1440, с axe
docker build -t kompas .
```

Коммиты проверяет gitleaks (`.githooks/pre-commit`, подключается при `pnpm install`): `brew install gitleaks`.
