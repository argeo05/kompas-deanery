import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { ConceptBar } from "@/components/shell/concept-bar";
import { StatusRegion } from "@/components/ui/status-region";
import { SkipLink } from "@/components/shell/skip-link";
import {
  MOTION_COOKIE,
  TEXT_COOKIE,
  THEME_COOKIE,
  parseMotion,
  parseTextSize,
  parseTheme,
} from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Компас",
  description: "Личный кабинет студента — концепт",
  // PWA (SPEC §6.13): манифест — src/app/manifest.ts; для iOS — иконка и режим «как приложение».
  appleWebApp: { capable: true, title: "Компас", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Цвет строки состояния браузера = --bg (значения дублируют tokens.css: meta не читает CSS-переменные).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1420" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Все страницы рендерятся на запрос: nonce из CSP (proxy.ts) подставляется только при динамическом
  // рендеринге, статический HTML собирается без заголовков и его скрипты CSP бы заблокировал (D-005).
  await connection();
  // Тему сервер берёт из cookie и сразу ставит data-theme: без мигания и без inline-скрипта (D-007).
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const textSize = parseTextSize(jar.get(TEXT_COOKIE)?.value);
  const motion = parseMotion(jar.get(MOTION_COOKIE)?.value);
  return (
    <html lang="ru" data-theme={theme} data-text={textSize} data-motion={motion} className="h-full">
      <body className="flex min-h-full flex-col">
        <SkipLink />
        <StatusRegion />
        <ConceptBar />
        {children}
      </body>
    </html>
  );
}
