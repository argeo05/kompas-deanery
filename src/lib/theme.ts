// Тема и свёрнутая полоса концепта хранятся в cookie: сервер сразу рендерит нужный data-theme,
// поэтому нет мигания темы и не нужен inline-скрипт до гидратации (CSP с nonce, D-005, D-007).

export const THEMES = ["system", "light", "dark"] as const;
export type ThemePref = (typeof THEMES)[number];

export const THEME_COOKIE = "kompas-theme";
/** Полоса концепта на мобильной свёрнута до значка ⓘ после первого показа (SPEC §5.5). */
export const CONCEPT_COOKIE = "kompas-concept-seen";

export function parseTheme(value: string | undefined): ThemePref {
  return (THEMES as readonly string[]).includes(value ?? "") ? (value as ThemePref) : "system";
}

/** Cookie на год, только для первой стороны; не HttpOnly — её пишет переключатель в браузере. */
export function preferenceCookie(name: string, value: string): string {
  return `${name}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

// Размер текста и анимации (SPEC §6.11 п.2): тоже cookie, чтобы сервер сразу поставил атрибуты на <html>.
export const TEXT_SIZES = ["standard", "large"] as const;
export type TextSizePref = (typeof TEXT_SIZES)[number];
export const TEXT_COOKIE = "kompas-text";

export const MOTIONS = ["system", "reduce"] as const;
export type MotionPref = (typeof MOTIONS)[number];
export const MOTION_COOKIE = "kompas-motion";

export function parseTextSize(value: string | undefined): TextSizePref {
  return (TEXT_SIZES as readonly string[]).includes(value ?? "")
    ? (value as TextSizePref)
    : "standard";
}

export function parseMotion(value: string | undefined): MotionPref {
  return (MOTIONS as readonly string[]).includes(value ?? "") ? (value as MotionPref) : "system";
}
