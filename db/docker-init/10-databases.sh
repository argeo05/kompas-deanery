#!/bin/sh
# Первый запуск тома: отдельные базы для тестов и для worktree DeepSeek (D-004).
# Основная база (POSTGRES_DB, по умолчанию kompas_dev) создаётся образом сама.
# На уже существующем томе этот скрипт не выполняется — базы досоздаёт `pnpm db:up` (db/ensure-databases.ts).
set -eu
for db in kompas_test kompas_ds_test kompas_ds_dev; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "CREATE DATABASE $db"
done
