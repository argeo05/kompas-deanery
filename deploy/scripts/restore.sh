#!/usr/bin/env bash
# Восстановление из копии: deploy/scripts/restore.sh /var/backups/kompas/kompas-….sql.gz
# Стирает текущую схему public. Для демо-данных быстрее пересев: deploy/scripts/reseed.sh (≤ 2 минут).
source "$(dirname "$0")/lib.sh"
file="${1:?Укажите файл копии}"
read -r -p "Текущие данные будут стёрты. Продолжить? [yes/N] " answer
[ "$answer" = "yes" ] || { echo "Отменено"; exit 1; }
"${COMPOSE[@]}" exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
gunzip -c "$file" | "${COMPOSE[@]}" exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'
echo "Восстановлено из $file"
