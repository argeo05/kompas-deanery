#!/bin/sh
# Stop-хук Claude Code: типы, unit (кроме тикетов из .claude/ds-pending.txt) и матрица изоляции.
# Код выхода 2 возвращает Claude к работе с выводом ошибок.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 2
excludes=$(grep -v '^[[:space:]]*#' .claude/ds-pending.txt 2>/dev/null | awk 'NF >= 2 { printf " --exclude %s", $2 }')
# shellcheck disable=SC2086 # $excludes — список флагов, разбиение по словам нужно
{ pnpm typecheck && pnpm vitest run --project unit $excludes && pnpm test:security; } 1>&2 || exit 2
