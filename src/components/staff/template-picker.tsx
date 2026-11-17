"use client";

import { Button } from "@/components/ui/button";
import type { Template } from "@/lib/staff-templates";

// Кнопки-подсказки с шаблонами ответов: подставляют текст в поле, а не отправляют его.
export function TemplatePicker({
  templates,
  onPick,
  label = "Шаблоны ответов",
}: {
  templates: Template[];
  onPick: (text: string) => void;
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1">
      <p className="type-caption text-ink-2">{label}: нажмите, чтобы подставить текст</p>
      <div className="flex flex-wrap gap-2">
        {templates.map((t) => (
          <Button
            key={t.id}
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onPick(t.text)}
          >
            {t.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
