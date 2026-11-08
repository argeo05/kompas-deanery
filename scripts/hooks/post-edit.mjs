#!/usr/bin/env node
// PostToolUse-хук Claude Code (SPEC §12.3): Prettier + ESLint по изменённому файлу.
// Ошибки ESLint возвращаются агенту (exit 2), правка при этом уже применена.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const file = input.tool_input?.file_path;
if (!file || /node_modules|\.next\//.test(file)) process.exit(0);

const run = (bin, args) =>
  execFileSync("pnpm", ["exec", bin, ...args], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });

try {
  run("prettier", ["--write", "--ignore-unknown", "--log-level", "warn", file]);
} catch {
  // синтаксическая ошибка — её покажет ESLint/tsc
}

if (/\.(m?[jt]sx?)$/.test(file)) {
  try {
    run("eslint", ["--fix", "--no-warn-ignored", file]);
  } catch (e) {
    process.stderr.write(`ESLint: ${file}\n${e.stdout ?? ""}${e.stderr ?? ""}`);
    process.exit(2);
  }
}
