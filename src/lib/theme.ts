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
