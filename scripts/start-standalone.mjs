// Запуск standalone-сборки как в Docker: `next start` с output: "standalone" не поддерживается.
// Next не копирует статику в standalone — делаем это сами (как в Dockerfile).
import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

const out = ".next/standalone";
if (!existsSync(`${out}/server.js`)) {
  console.error("Нет .next/standalone/server.js — сначала pnpm build");
  process.exit(1);
}
cpSync(".next/static", `${out}/.next/static`, { recursive: true });
if (existsSync("public")) cpSync("public", `${out}/public`, { recursive: true });

const child = spawn(process.execPath, ["server.js"], {
  cwd: out,
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
