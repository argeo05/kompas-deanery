import type { Metadata } from "next";
import { connection } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Компас",
  description: "Личный кабинет студента — концепт",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Все страницы рендерятся на запрос: nonce из CSP (proxy.ts) подставляется только при динамическом
  // рендеринге, статический HTML собирается без заголовков и его скрипты CSP бы заблокировал (D-005).
  await connection();
  return (
    <html lang="ru" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
