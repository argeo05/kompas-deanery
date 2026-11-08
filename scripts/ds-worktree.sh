#!/bin/sh
# Рабочая копия для тикета DeepSeek: scripts/ds-worktree.sh DS-XX
# Ветка ds/DS-XX от main в ../kompas-ds (существующий worktree переключается на неё),
# .env.ds → ../kompas-ds/.env (базы kompas_ds_dev и kompas_ds_test, D-004), pnpm install.
set -eu
ticket="${1:-}"
case "$ticket" in
  DS-[0-9][0-9]) ;;
  *) echo "Использование: scripts/ds-worktree.sh DS-XX" >&2; exit 1 ;;
esac

root=$(git rev-parse --show-toplevel)
wt="$(dirname "$root")/kompas-ds"
branch="ds/$ticket"
cd "$root"

# .env.ds создаётся один раз из .env: базы заменяются на kompas_ds_*, остальное (пароль, секреты) то же.
if [ ! -f .env.ds ]; then
  node -e '
    const fs = require("node:fs");
    const withDb = (u, db) => { const x = new URL(u); x.pathname = "/" + db; return x.toString(); };
    const out = fs.readFileSync(".env", "utf8").split("\n").map((l) =>
      l.startsWith("DATABASE_URL=") ? "DATABASE_URL=" + withDb(l.slice(13), "kompas_ds_dev")
      : l.startsWith("TEST_DATABASE_URL=") ? "TEST_DATABASE_URL=" + withDb(l.slice(18), "kompas_ds_test")
      : l);
    fs.writeFileSync(".env.ds", out.join("\n"));'
  echo "Создан .env.ds (kompas_ds_dev, kompas_ds_test)"
fi

git show-ref --verify --quiet "refs/heads/$branch" && exists=1 || exists=0
if git worktree list --porcelain | grep -qx "worktree $wt"; then
  if [ -n "$(git -C "$wt" status --porcelain)" ]; then
    echo "В $wt есть незакоммиченные изменения — закоммитьте или уберите их" >&2; exit 1
  fi
  if [ "$exists" = 1 ]; then git -C "$wt" switch "$branch"; else git -C "$wt" switch -c "$branch" main; fi
else
  if [ "$exists" = 1 ]; then git worktree add "$wt" "$branch"; else git worktree add -b "$branch" "$wt" main; fi
fi

cp .env.ds "$wt/.env"
cd "$wt"
pnpm install --frozen-lockfile
pnpm db:migrate
echo "Готово: $wt на ветке $branch. Откройте OpenCode в этой папке."
