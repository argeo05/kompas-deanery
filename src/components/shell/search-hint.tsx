"use client";

import * as React from "react";

// Подсказка горячей клавиши поиска: ⌘K на устройствах Apple, Ctrl K на остальных.
// Сервер и первая отрисовка в браузере дают «Ctrl K», после гидратации подсказка уточняется.

const subscribe = () => () => {};
const isApple = () => /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

export function useIsApple(): boolean {
  return React.useSyncExternalStore(subscribe, isApple, () => false);
}

export function SearchHint({ className }: { className?: string }) {
  const apple = useIsApple();
  return (
    <kbd aria-hidden className={className}>
      {apple ? "⌘K" : "Ctrl K"}
    </kbd>
  );
}
