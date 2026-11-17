#!/usr/bin/env bash
# Ночной пересев демо-данных (SPEC §8.3, D-017): TRUNCATE + сид, даты — от сегодняшнего дня.
# cron в 04:00 МСК (см. crontab.example). Счётчики лимитов входа не стираются, сеансы закрываются.
source "$(dirname "$0")/lib.sh"
cd "$ROOT"
"${COMPOSE[@]}" --profile tools run --rm -T tools node_modules/.bin/tsx scripts/nightly-reseed.ts
echo "$(date -Is) reseed ok"
