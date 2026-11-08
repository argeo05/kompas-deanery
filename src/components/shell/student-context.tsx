"use client";

import * as React from "react";

// Кто сейчас вошёл — для экранов кабинета (приветствие, ключ локального кэша данных).
// Значения приходят с сервера из сессии; клиент их не выбирает.

export interface StudentInfo {
  userId: string;
  displayName: string;
}

const StudentContext = React.createContext<StudentInfo | null>(null);

export function StudentProvider({
  value,
  children,
}: {
  value: StudentInfo;
  children: React.ReactNode;
}) {
  return <StudentContext.Provider value={value}>{children}</StudentContext.Provider>;
}

export function useStudent(): StudentInfo {
  const value = React.useContext(StudentContext);
  if (!value) throw new Error("useStudent вызывается внутри <StudentProvider>");
  return value;
}
