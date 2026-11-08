import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkContrast, contrastRatio, parseTokens } from "@/lib/contrast";

// Контраст токенов «Бумага и чернила» (SPEC §7.2, §7.7: 1.4.3 и 1.4.11).
const css = readFileSync("src/styles/tokens.css", "utf8");
const tokens = parseTokens(css);

describe("контраст токенов", () => {
  it("формула совпадает с эталоном WCAG", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("токены разобраны для обеих тем", () => {
    expect(Object.keys(tokens.light).length).toBeGreaterThan(30);
    expect(Object.keys(tokens.light)).toEqual(Object.keys(tokens.dark));
  });

  it("все пары проходят AA в светлой и тёмной теме", () => {
    const failed = checkContrast(tokens)
      .filter((r) => !r.ok)
      .map((r) => `${r.theme}: --${r.fg} на --${r.bg} = ${r.ratio.toFixed(2)} < ${r.min}`);
    expect(failed).toEqual([]);
  });
});

describe("цвета только через токены", () => {
  it("hex-значения цветов есть только в tokens.css", () => {
    const globals = readFileSync("src/app/globals.css", "utf8");
    expect(globals.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
  });

  // Правило фазы C: в UI нет сырых цветов и произвольных px. Исключение — themeColor в layout.tsx
  // (meta theme-color не читает CSS-переменные).
  const uiFiles = ["src/components", "src/app"].flatMap((dir) =>
    (readdirSync(dir, { recursive: true }) as string[])
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => join(dir, f)),
  );

  it.each(uiFiles.filter((f) => !f.endsWith("app/layout.tsx")))("%s без hex и px", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src.match(/#[0-9a-f]{3,8}\b(?![-\w])/gi) ?? []).toEqual([]);
    expect(src.match(/-\[[^\]]*\d+px[^\]]*\]/g) ?? []).toEqual([]);
    expect(
      src.match(
        /\b(?:bg|text|border|ring|fill|stroke)-(?:red|blue|green|gray|slate|zinc|amber|yellow|white|black)(?:-\d+)?\b/g,
      ) ?? [],
    ).toEqual([]);
  });
});
