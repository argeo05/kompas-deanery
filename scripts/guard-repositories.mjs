#!/usr/bin/env node
// PreToolUse-хук Claude Code (SPEC прил. C.5, §12.3): страховка от IDOR в src/server/repositories/**.
// Если правка содержит запрос к личной таблице без условия по владельцу (student_id/user_id) —
// печатаем причину в stderr и выходим с кодом 2: Claude Code блокирует правку.
// Это эвристика. Основная защита — tests/security и RLS.
import { readFileSync } from "node:fs";

const PERSONAL = ["requests", "grades", "documents", "notifications", "tickets"];
const OWNER = /\b(student_?id|user_?id)\b/i;
const tables = PERSONAL.join("|");

// Drizzle: .from(requests) / .update(grades) / .delete(documents) / db.query.tickets.findMany(
// SQL:     FROM requests / UPDATE grades / DELETE FROM documents / JOIN notifications
const QUERY = new RegExp(
  [
    String.raw`\.(?:from|update|delete)\(\s*(?:schema\.)?(${tables})\b`,
    String.raw`\.query\.(${tables})\.find(?:Many|First)\(`,
    String.raw`\b(?:from|update|join)\s+"?(${tables})"?\b`,
  ].join("|"),
  "gi",
);

function editedTexts(input) {
  const t = input.tool_input ?? {};
  if (typeof t.content === "string") return [t.content];
  if (typeof t.new_string === "string") return [t.new_string];
  if (Array.isArray(t.edits)) return t.edits.map((e) => e.new_string ?? "");
  return [];
}

// Запрос — от совпадения до конца выражения: «;», пустая строка или 600 символов.
function statementAt(text, index) {
  const rest = text.slice(index, index + 600);
  const end = rest.search(/;|\n\s*\n/);
  return end === -1 ? rest : rest.slice(0, end);
}

export function findViolations(text) {
  const found = [];
  for (const m of text.matchAll(QUERY)) {
    const table = m[1] ?? m[2] ?? m[3];
    const stmt = statementAt(text, m.index);
    if (!OWNER.test(stmt)) {
      const line = text.slice(0, m.index).split("\n").length;
      found.push({ table: table.toLowerCase(), line, snippet: stmt.split("\n")[0].trim() });
    }
  }
  return found;
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    process.exit(0); // не наш формат — не мешаем
  }
  const file = String(input.tool_input?.file_path ?? "").replaceAll("\\", "/");
  if (!/(^|\/)src\/server\/repositories\//.test(file)) process.exit(0);

  const violations = editedTexts(input).flatMap(findViolations);
  if (violations.length === 0) process.exit(0);

  const list = violations
    .map((v) => `  • строка ~${v.line}: таблица ${v.table} — «${v.snippet}»`)
    .join("\n");
  process.stderr.write(
    `guard-repositories: запрос к личной таблице без условия по владельцу (student_id/user_id).\n` +
      `${list}\n` +
      `Добавьте условие по владельцу из сессии (CLAUDE.md, SPEC §9.3). Если запрос намеренно без владельца ` +
      `(роль staff) — вынесите его в отдельный репозиторий staff и обсудите с человеком.\n`,
  );
  process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
