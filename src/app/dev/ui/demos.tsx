"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";

// Интерактивные части витрины: toast и нижний лист.

export function ToastDemo() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        onClick={() => toast({ tone: "info", title: "Расписание обновлено" })}
      >
        Показать info
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast({
            tone: "success",
            title: "Заявка отправлена",
            description: "Ответ придёт в уведомления, обычно за 1–2 рабочих дня.",
          })
        }
      >
        Показать success
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast({
            tone: "error",
            title: "Не получилось отправить: пропал интернет",
            description: "Мы сохранили заявку и отправим, когда сеть вернётся.",
            action: { label: "Повторить сейчас", onClick: () => {} },
          })
        }
      >
        Показать ошибку
      </Button>
    </div>
  );
}

export function SheetDemo() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="secondary" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        Открыть лист
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Где аудитория 4012"
        description="Корпус 4, четвёртый этаж, налево от лифта."
      >
        <div className="flex flex-col gap-3 pb-2">
          <p>
            Лист закрывается свайпом вниз, клавишей Esc, кнопкой «Закрыть» или касанием по
            затемнению. Пока он открыт, фокус остаётся внутри.
          </p>
          <Button onClick={() => setOpen(false)}>Понятно</Button>
        </div>
      </Sheet>
    </>
  );
}

export function LoadingButtonDemo() {
  const [loading, setLoading] = React.useState(false);
  return (
    <Button
      loading={loading}
      onClick={() => {
        setLoading(true);
        window.setTimeout(() => setLoading(false), 2000);
      }}
    >
      Заказать справку
    </Button>
  );
}
