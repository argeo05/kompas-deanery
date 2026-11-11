import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ProfileScreen } from "@/components/profile/profile-screen";
import {
  MOTION_COOKIE,
  TEXT_COOKIE,
  THEME_COOKIE,
  parseMotion,
  parseTextSize,
  parseTheme,
} from "@/lib/theme";

export const metadata: Metadata = { title: "Профиль и настройки — Компас" };

export default async function ProfilePage() {
  const jar = await cookies();
  return (
    <ProfileScreen
      prefs={{
        theme: parseTheme(jar.get(THEME_COOKIE)?.value),
        textSize: parseTextSize(jar.get(TEXT_COOKIE)?.value),
        motion: parseMotion(jar.get(MOTION_COOKIE)?.value),
      }}
    />
  );
}
