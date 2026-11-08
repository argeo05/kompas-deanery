"use client";

import * as React from "react";

// Постоянный живой регион оболочки (WCAG 4.1.3). Регион лежит в корневом layout и существует
// всегда, поэтому читалки озвучивают смену его текста. Регион, который появляется сразу с текстом
// (как раньше role="status" в LoadingRegion), часть читалок молча пропускает.

export const STATUS_REGION_ID = "app-status";

export function StatusRegion() {
  return <div id={STATUS_REGION_ID} role="status" aria-live="polite" className="sr-only" />;
}

/** Пишет сообщение в общий регион, пока компонент на экране. Ничего не рисует. */
export function Announce({ message }: { message: string }) {
  React.useEffect(() => {
    const region = document.getElementById(STATUS_REGION_ID);
    if (!region) return;
    region.textContent = message;
    return () => {
      if (region.textContent === message) region.textContent = "";
    };
  }, [message]);
  return null;
}
