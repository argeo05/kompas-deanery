import type { Metadata } from "next";
import { TodayScreen } from "@/components/today/today-screen";
import { nowMsk } from "@/lib/time";

export const metadata: Metadata = { title: "Сегодня — Компас" };

// Приветствие и дата считаются на сервере и приходят в первом HTML: раньше они появлялись
// только после загрузки JS и ответа API (Lighthouse: LCP 5,1 с и сдвиг макета, C10/C11).
export default function TodayPage() {
  return <TodayScreen serverNow={nowMsk()} />;
}
