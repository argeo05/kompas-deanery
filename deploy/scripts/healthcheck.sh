#!/usr/bin/env bash
# Проверка живости (SPEC §8.3): /api/health отвечает 200 и {"ok":true}, главная и /login открываются.
# Для внешнего мониторинга (раз в 5 минут) и cron: при сбое — код 1 и строка в stderr.
# Использование: healthcheck.sh https://ваш-домен   (без аргумента — http://127.0.0.1)
base="${1:-http://127.0.0.1}"
fail=0
check() {
  local path="$1" want="$2" code
  code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$base$path" || echo 000)
  if [ "$code" != "$want" ]; then echo "FAIL $path: $code (ожидали $want)" >&2; fail=1; else echo "ok   $path: $code"; fi
}
check /api/health 200
check /login 200
check /jury 200
curl -s -m 10 "$base/api/health" | grep -q '"ok":true' || { echo "FAIL /api/health: тело без ok:true" >&2; fail=1; }
exit $fail
