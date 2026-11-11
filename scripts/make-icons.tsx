// Иконки PWA (SPEC §6.13 п.1) из знака «Компас» (SPEC §7.3): 192, 512, maskable 512, Apple 180.
// Запуск: pnpm tsx scripts/make-icons.tsx — PNG кладутся в public/icons и коммитятся.
// Цвета из tokens.css: фон --ink (светлая тема), верх стрелки --accent тёмной темы (на тёмном фоне
// заметнее), низ --surface. PNG не читает CSS-переменные, поэтому значения повторены здесь.
import { writeFileSync } from "node:fs";
import { ImageResponse } from "next/og";

const INK = "#14213d";
const SURFACE = "#ffffff";
const ACCENT_LIGHT = "#8ea2ff";

/** Ромб-стрелка на квадрате. safe — доля стороны под знак (maskable: центр 80 %). */
function Mark({ size, rounded, safe }: { size: number; rounded: boolean; safe: number }) {
  const inner = size * safe;
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: INK,
        borderRadius: rounded ? size * 0.28 : 0,
      }}
    >
      <svg width={inner} height={inner} viewBox="0 0 32 32">
        <path d="M16 5 22 16H10z" fill={ACCENT_LIGHT} />
        <path d="M10 16h12l-6 11z" fill={SURFACE} />
      </svg>
    </div>
  );
}

async function png(name: string, size: number, rounded: boolean, safe: number) {
  const res = new ImageResponse(<Mark size={size} rounded={rounded} safe={safe} />, {
    width: size,
    height: size,
  });
  writeFileSync(`public/icons/${name}`, Buffer.from(await res.arrayBuffer()));
  console.log(`public/icons/${name}`);
}

await png("icon-192.png", 192, true, 0.8);
await png("icon-512.png", 512, true, 0.8);
// maskable: система сама обрезает фон по своей форме — фон во всю площадь, знак в безопасной зоне.
await png("maskable-512.png", 512, false, 0.6);
// iOS скругляет углы сама.
await png("apple-touch-icon.png", 180, false, 0.75);
