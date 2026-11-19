"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { CheckRow } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { clearSavedData, savedDataBytes } from "@/lib/offline/device-data";
import { isOfflineStoreEnabled, setOfflineStoreEnabled } from "@/lib/offline/prefs";

// «Без интернета» (SPEC §6.11 п.3): переключатель хранения данных на устройстве, размер, очистка.
// Выключение сразу стирает сохранённое: человек, отказавшийся от хранения, не должен гадать, что осталось.

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;
}

export function OfflineSection() {
  const toast = useToast();
  const [enabled, setEnabled] = React.useState(true);
  const [bytes, setBytes] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(() => {
    void savedDataBytes().then(setBytes);
  }, []);

  React.useEffect(() => {
    queueMicrotask(() => {
      setEnabled(isOfflineStoreEnabled());
      refresh();
    });
  }, [refresh]);

  async function clear(message: string) {
    setBusy(true);
    try {
      await clearSavedData();
      toast({ tone: "success", title: message });
    } finally {
      setBusy(false);
      refresh();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <CheckRow
        label="Хранить данные на устройстве"
        hint="Расписание, оценки, заявки и справки откроются без интернета. При выходе всё стирается."
        checked={enabled}
        onChange={(e) => {
          const on = e.target.checked;
          setEnabled(on);
          setOfflineStoreEnabled(on);
          if (!on && !busy) void clear("Хранение выключено, сохранённое стёрто");
        }}
      />
      <p className="type-caption text-ink-2">
        {bytes === null
          ? "Браузер не сообщает, сколько места занимают данные."
          : `Сейчас Компас занимает на устройстве около ${formatBytes(bytes)}.`}
      </p>
      <Button
        variant="secondary"
        size="sm"
        className="max-w-full self-start whitespace-normal"
        loading={busy}
        onClick={() => void clear("Сохранённые данные стёрты")}
      >
        Очистить сохранённые данные
      </Button>
    </div>
  );
}
