// Сборка service worker (SPEC §6.13, D-014): src/sw/sw.ts → public/sw.js после `next build`.
// Список precache — оболочка приложения: вся статика .next/static (у файлов хеш в имени), иконки,
// манифест и запасная /offline. HTML страниц кабинета в список не попадает никогда.
// Next 16 собирает Turbopack, а плагин Serwist для webpack с ним не работает — поэтому свой шаг.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { build } from "esbuild";

const buildId = readFileSync(".next/BUILD_ID", "utf8").trim();

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const md5 = (path) => createHash("md5").update(readFileSync(path)).digest("hex");

// Карты исходников и служебные манифесты dev в оболочку не нужны.
const staticFiles = walk(".next/static").filter((f) => !f.endsWith(".map"));
const entries = [
  ...staticFiles.map((f) => ({
    url: `/_next/static/${relative(".next/static", f).replaceAll("\\", "/")}`,
    // Имя содержит хеш содержимого или BUILD_ID: ревизия не нужна.
    revision: null,
  })),
  ...walk("public/icons").map((f) => ({
    url: `/${relative("public", f).replaceAll("\\", "/")}`,
    revision: md5(f),
  })),
  { url: "/manifest.webmanifest", revision: buildId },
  { url: "/offline", revision: buildId },
];

const bytes = staticFiles.reduce((n, f) => n + statSync(f).size, 0);

await build({
  entryPoints: ["src/sw/sw.ts"],
  outfile: "public/sw.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  minify: true,
  sourcemap: false,
  legalComments: "none",
  define: {
    __KOMPAS_PRECACHE__: JSON.stringify(entries),
    "process.env.NODE_ENV": '"production"',
  },
  logLevel: "warning",
});

if (!existsSync("public/sw.js")) throw new Error("public/sw.js не собран");
console.log(
  `sw.js: ${entries.length} файлов в precache, статика ${(bytes / 1024 / 1024).toFixed(1)} МБ, BUILD_ID ${buildId}`,
);
