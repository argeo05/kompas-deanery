import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Проверяем хук так, как его вызывает Claude Code: JSON на stdin, код выхода.
function runGuard(file_path: string, content: string) {
  return spawnSync("node", ["scripts/guard-repositories.mjs"], {
    input: JSON.stringify({ tool_name: "Write", tool_input: { file_path, content } }),
    encoding: "utf8",
  });
}

const repo = "/repo/src/server/repositories/requests.ts";

describe("guard-repositories", () => {
  it("блокирует выборку из личной таблицы без владельца", () => {
    const r = runGuard(repo, "return tx.select().from(requests).where(eq(requests.id, id));");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("requests");
  });

  it("пропускает выборку с условием по владельцу", () => {
    const r = runGuard(
      repo,
      "return tx.select().from(requests).where(and(eq(requests.id, id), eq(requests.studentId, studentId)));",
    );
    expect(r.status).toBe(0);
  });

  it("ловит сырой SQL", () => {
    expect(runGuard(repo, "sql`SELECT * FROM grades WHERE id = ${id}`").status).toBe(2);
    expect(runGuard(repo, "sql`SELECT * FROM grades WHERE student_id = ${sid}`").status).toBe(0);
  });

  it("не трогает файлы вне репозиториев и неличные таблицы", () => {
    expect(runGuard("/repo/src/lib/x.ts", "db.select().from(requests)").status).toBe(0);
    expect(runGuard(repo, "db.select().from(requestTypes)").status).toBe(0);
  });
});
