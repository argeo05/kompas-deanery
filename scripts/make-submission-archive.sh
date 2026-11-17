#!/usr/bin/env bash
# Архив исходников для сдачи (резерв к ссылке на репозиторий, SPEC §16.1).
# Берёт только файлы, отслеживаемые git (git ls-files): без node_modules, .next, .env, test-results.
# Исключает .git и тяжёлые PNG-скриншоты: docs/qa/shots (≈47 МБ) и docs/process/shots (≈57 МБ).
# Историю git не трогает. Использование:
#   scripts/make-submission-archive.sh [--with-process-shots] [каталог-назначения]
# Отчёты оценщиков docs/qa/*.md остаются, но ссылки на их скриншоты в архиве не откроются.
set -euo pipefail

with_process_shots=0
dest="."
for arg in "$@"; do
  case "$arg" in
    --with-process-shots) with_process_shots=1 ;;
    -h | --help) sed -n '2,8p' "$0"; exit 0 ;;
    *) dest="$arg" ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"
mkdir -p "$dest"
name="kompas-src-$(date +%Y%m%d)"
out="$(cd "$dest" && pwd)/${name}.tar.gz"

list="$(mktemp)"
trap 'rm -f "$list"' EXIT

git ls-files -z \
  | tr '\0' '\n' \
  | grep -v -E '^docs/qa/shots/' \
  | { if [ "$with_process_shots" = 1 ]; then cat; else grep -v -E '^docs/process/shots/'; fi; } \
  | awk -F/ '{ b = $NF } b ~ /^\.env/ && b != ".env.example" { next } { print }' \
  | grep -E -v '(^|/)(node_modules|\.next|test-results)/' > "$list"

# Страховка: ни .env, ни ключей в архиве быть не должно (допустим только .env.example).
if grep -E '(^|/)\.env(\.|$)' "$list" | grep -v -E '\.env\.example$' | grep -q .; then
  echo "В списке файлов есть .env: прерываю" >&2
  exit 1
fi

tar -czf "$out" --transform "s,^,${name}/," -T "$list" 2>/dev/null \
  || { # bsdtar (macOS): другая опция для переименования путей
    tar -czf "$out" -s ",^,${name}/," -T "$list"
  }

size="$(du -h "$out" | cut -f1)"
echo "Готово: $out ($size), файлов: $(wc -l < "$list" | tr -d ' ')"
