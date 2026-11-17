#!/usr/bin/env bash
# Первый запуск на чистом сервере: сборка, миграции, сид, старт. Повторно не запускать (сид откажется).
source "$(dirname "$0")/lib.sh"
cd "$ROOT"
"${COMPOSE[@]}" up -d db
"${COMPOSE[@]}" --profile tools run --rm -T tools node_modules/.bin/tsx db/migrate.ts
"${COMPOSE[@]}" --profile tools run --rm -T tools node_modules/.bin/tsx db/seed/index.ts
"${COMPOSE[@]}" up -d --build
echo "Готово. Проверьте: deploy/scripts/healthcheck.sh"
