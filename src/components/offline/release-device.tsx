"use client";

import * as React from "react";
import { releaseDevice } from "@/lib/offline/device-data";

// Кабинет сотрудника (SPEC §6.13 п.5, AC-13.4): если на устройстве остались данные студента,
// который не вышел, они стираются — офлайн-оболочка не покажет их сотруднику.
export function ReleaseDevice() {
  React.useEffect(() => {
    void releaseDevice();
  }, []);
  return null;
}
