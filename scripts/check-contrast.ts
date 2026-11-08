// Сводка контраста токенов (WCAG 2.x, SPEC §7.2): pnpm tsx scripts/check-contrast.ts
//   без флагов — все пары из CONTRAST_PAIRS по обеим темам;
//   --md       — таблицы для SPEC §7.2: текст и элементы на --bg / --surface / --surface-2,
//                бейджи -fg на -bg, цвета дисциплин на --surface (+ минимальное различие ΔE OKLab).
// Код выхода 1 — есть пары ниже порога.
import { readFileSync } from "node:fs";
import { checkContrast, contrastRatio, parseTokens, type Theme } from "../src/lib/contrast";

const css = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
const tokens = parseTokens(css);
const results = checkContrast(tokens);
const failed = results.filter((r) => !r.ok);
const THEMES: Theme[] = ["light", "dark"];
const fmt = (n: number) => n.toFixed(2).replace(".", ",");
const ratio = (theme: Theme, fg: string, bg: string) =>
  contrastRatio(tokens[theme][fg], tokens[theme][bg]);

/** Различие цветов в OKLab ×100 (≈ 2 — порог заметности; закладкам нужно заметно больше). */
function deltaE(a: string, b: string): number {
  const lab = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bl);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bl);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bl);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  };
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * 100;
}

function printMarkdown() {
  const bgs = ["bg", "surface", "surface-2"];
  const rows: [string, 4.5 | 3][] = [
    ...(["ink", "ink-2", "accent", "accent-hover", "ok", "warn", "alert", "info", "coral"].map(
      (t) => [t, 4.5] as [string, 4.5],
    )),
    ["focus", 3],
    ["line-strong", 3],
  ];
  console.log("| Токен | Светлая | bg / surface / surface-2 | Тёмная | bg / surface / surface-2 | Порог |");
  console.log("|---|---|---|---|---|---|");
  for (const [t, min] of rows) {
    const cells = THEMES.map(
      (th) => `\`${tokens[th][t].toUpperCase()}\` | ${bgs.map((b) => fmt(ratio(th, t, b))).join(" / ")}`,
    );
    console.log(`| \`--${t}\` | ${cells.join(" | ")} | ${String(min).replace(".", ",")} |`);
  }
  console.log(`| \`--accent-ink\` на \`--accent\` | | ${fmt(ratio("light", "accent-ink", "accent"))} | | ${fmt(ratio("dark", "accent-ink", "accent"))} | 4,5 |`);

  console.log("\n| Пара бейджа | Светлая -bg / -fg | Контраст | Тёмная -bg / -fg | Контраст |");
  console.log("|---|---|---|---|---|");
  for (const s of ["ok", "warn", "info", "coral", "alert", "neutral"]) {
    const cells = THEMES.map(
      (th) =>
        `\`${tokens[th][`${s}-bg`].toUpperCase()}\` / \`${tokens[th][`${s}-fg`].toUpperCase()}\` | ${fmt(ratio(th, `${s}-fg`, `${s}-bg`))}`,
    );
    console.log(`| \`--${s}-bg/-fg\` | ${cells.join(" | ")} |`);
  }

  console.log("\n| Дисциплина | Светлая | на surface | Тёмная | на surface |");
  console.log("|---|---|---|---|---|");
  const course = Array.from({ length: 10 }, (_, i) => `course-${i}`);
  for (const c of course) {
    const cells = THEMES.map((th) => `\`${tokens[th][c].toUpperCase()}\` | ${fmt(ratio(th, c, "surface"))}`);
    console.log(`| \`--${c}\` | ${cells.join(" | ")} |`);
  }
  for (const th of THEMES) {
    let min = { d: Infinity, a: "", b: "" };
    for (const a of course)
      for (const b of course) {
        if (a >= b) continue;
        const d = deltaE(tokens[th][a], tokens[th][b]);
        if (d < min.d) min = { d, a, b };
      }
    console.log(`\n${th}: минимальное различие дисциплин ΔE = ${fmt(min.d)} (--${min.a} и --${min.b})`);
  }
}

if (process.argv.includes("--md")) {
  printMarkdown();
} else {
  for (const r of results) {
    const mark = r.ok ? "ok  " : "FAIL";
    console.log(
      `${mark} ${r.theme.padEnd(5)} --${r.fg} на --${r.bg}: ${r.ratio.toFixed(2)} (нужно ${r.min}) — ${r.why}`,
    );
  }
}
console.log(`\n${results.length - failed.length}/${results.length} пар проходят WCAG 2.2 AA`);
for (const r of failed) console.log(`FAIL ${r.theme} --${r.fg} на --${r.bg}: ${r.ratio.toFixed(2)} < ${r.min}`);
process.exit(failed.length ? 1 : 0);
