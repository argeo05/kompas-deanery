import type { MetadataRoute } from "next";

// Манифест устанавливаемого приложения (SPEC §6.13 п.1, AC-13.2): /manifest.webmanifest.
// Цвета повторяют --bg и --ink из tokens.css (светлая тема): манифест не читает CSS-переменные.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/today",
    name: "Компас — кабинет студента (концепт)",
    short_name: "Компас",
    description:
      "Расписание, учёба, заявки и справки — в том числе без интернета. Концепт, данные вымышленные.",
    lang: "ru",
    dir: "ltr",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f5f0",
    theme_color: "#14213d",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Расписание", url: "/schedule" },
      { name: "Заявки", url: "/requests" },
    ],
  };
}
