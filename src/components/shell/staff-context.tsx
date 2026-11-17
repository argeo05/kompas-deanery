"use client";

import * as React from "react";

// Кто вошёл как сотрудник — для экранов кабинета (ключ локального кэша данных, подпись в ответах).
// Значения приходят с сервера из сессии; клиент их не выбирает.

export interface StaffInfo {
  userId: string;
  displayName: string;
  unit: string;
}

const StaffContext = React.createContext<StaffInfo | null>(null);

export function StaffProvider({
  value,
  children,
}: {
  value: StaffInfo;
  children: React.ReactNode;
}) {
  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}

export function useStaff(): StaffInfo {
  const value = React.useContext(StaffContext);
  if (!value) throw new Error("useStaff вызывается внутри <StaffProvider>");
  return value;
}
