#!/usr/bin/env bash
# Ежедневная резервная копия БД (SPEC §8.3): pg_dump → gzip, хранится 14 дней.
# cron: см. deploy/crontab.example. Копия лежит на том же сервере — для защиты от потери
# хоста её нужно дополнительно выгружать вручную (rsync/scp на другой хост).
source "$(dirname "$0")/lib.sh"
umask 077
mkdir -p "$BACKUP_DIR"
file="$BACKUP_DIR/kompas-$(date +%Y%m%d-%H%M%S).sql.gz"
"${COMPOSE[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' | gzip -9 > "$file.tmp"
# Пустая или обрезанная копия — ошибка, а не «успех».
gzip -t "$file.tmp"
[ "$(stat -c%s "$file.tmp" 2>/dev/null || stat -f%z "$file.tmp")" -gt 1024 ]
mv "$file.tmp" "$file"
find "$BACKUP_DIR" -name 'kompas-*.sql.gz' -mtime +14 -delete
echo "$(date -Is) backup ok: $file"
