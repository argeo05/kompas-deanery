// Контраст по WCAG 2.2 (1.4.3, 1.4.11) для токенов из src/styles/tokens.css.
// Используется тестом tests/unit/contrast.test.ts и скриптом scripts/check-contrast.ts.

export type Theme = "light" | "dark";
export type ThemeTokens = Record<Theme, Record<string, string>>;

/** Относительная яркость цвета #rrggbb. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Ожидался цвет #rrggbb, получено «${hex}»`);
  const channel = (i: number) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Токены вида `--name: light-dark(#light, #dark)` → значения по темам. Остальные токены пропускаются. */
export function parseTokens(css: string): ThemeTokens {
  const out: ThemeTokens = { light: {}, dark: {} };
  const re = /--([a-z0-9-]+):\s*light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)/gi;
  for (const [, name, light, dark] of css.matchAll(re)) {
    out.light[name] = light.toLowerCase();
    out.dark[name] = dark.toLowerCase();
  }
  return out;
}

export interface ContrastPair {
  fg: string;
  bg: string;
  /** 4.5 — обычный текст, 3 — крупный текст и элементы интерфейса. */
  min: 4.5 | 3;
  why: string;
}

const TEXT_BGS = ["bg", "surface", "surface-2"];

/** Пары, которые реально встречаются в интерфейсе. Новая пара в компонентах — новая строка здесь. */
export const CONTRAST_PAIRS: ContrastPair[] = [
  ...["ink", "ink-2", "accent", "ok", "warn", "alert", "info", "coral"].flatMap((fg) =>
    TEXT_BGS.map((bg) => ({ fg, bg, min: 4.5 as const, why: "текст и ссылки на поверхностях" })),
  ),
  { fg: "accent-ink", bg: "accent", min: 4.5, why: "текст на основной кнопке" },
  { fg: "accent-ink", bg: "accent-hover", min: 4.5, why: "основная кнопка при наведении" },
  { fg: "accent-hover", bg: "surface", min: 4.5, why: "ссылка при наведении" },
  ...["ok", "warn", "alert", "info", "coral", "neutral"].flatMap((s) => [
    { fg: `${s}-fg`, bg: `${s}-bg`, min: 4.5 as const, why: "текст статус-бейджа" },
    { fg: "ink", bg: `${s}-bg`, min: 4.5 as const, why: "основной текст на плашке статуса" },
  ]),
  ...TEXT_BGS.flatMap((bg) => [
    { fg: "focus", bg, min: 3 as const, why: "кольцо фокуса" },
    { fg: "line-strong", bg, min: 3 as const, why: "граница поля ввода" },
  ]),
  ...Array.from({ length: 10 }, (_, i) => ({
    fg: `course-${i}`,
    bg: "surface",
    min: 3 as const,
    why: "полоса дисциплины на карточке",
  })),
];

export interface ContrastResult extends ContrastPair {
  theme: Theme;
  ratio: number;
  ok: boolean;
}

export function checkContrast(tokens: ThemeTokens, pairs = CONTRAST_PAIRS): ContrastResult[] {
  return (["light", "dark"] as const).flatMap((theme) =>
    pairs.map((p) => {
      const fg = tokens[theme][p.fg];
      const bg = tokens[theme][p.bg];
      if (!fg || !bg) throw new Error(`Нет токена --${fg ? p.bg : p.fg} в теме ${theme}`);
      const ratio = contrastRatio(fg, bg);
      return { ...p, theme, ratio, ok: ratio >= p.min };
    }),
  );
}
