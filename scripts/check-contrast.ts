// Сводка контраста токенов: pnpm tsx scripts/check-contrast.ts. Код выхода 1 — есть пары ниже порога.
import { readFileSync } from "node:fs";
import { checkContrast, parseTokens } from "../src/lib/contrast";

const css = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
const results = checkContrast(parseTokens(css));
for (const r of results) {
  const mark = r.ok ? "ok  " : "FAIL";
  console.log(
    `${mark} ${r.theme.padEnd(5)} --${r.fg} на --${r.bg}: ${r.ratio.toFixed(2)} (нужно ${r.min}) — ${r.why}`,
  );
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} пар проходят WCAG 2.2 AA`);
process.exit(failed.length ? 1 : 0);
