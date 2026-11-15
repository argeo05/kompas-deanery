#!/usr/bin/env bash
# Общие переменные скриптов деплоя. Запускать на сервере из каталога репозитория.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE=(docker compose --env-file "$ROOT/.env.prod" -f "$ROOT/deploy/docker-compose.prod.yml")
BACKUP_DIR="${BACKUP_DIR:-/var/backups/kompas}"
