"use client";

import * as React from "react";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import {
  MOTION_COOKIE,
  TEXT_COOKIE,
  preferenceCookie,
  type MotionPref,
  type TextSizePref,
  type ThemePref,
} from "@/lib/theme";

// «Внешний вид» (SPEC §6.11 п.2): тема, размер текста, анимации. Всё применяется сразу
// (атрибут на <html>) и запоминается в cookie, чтобы сервер отрисовал так же без мигания.

function remember(name: string, attr: string, value: string) {
  document.documentElement.dataset[attr] = value;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = preferenceCookie(name, value) + secure;
}

export function AppearanceSection({
  theme,
  textSize,
  motion,
}: {
  theme: ThemePref;
  textSize: TextSizePref;
  motion: MotionPref;
}) {
  const [text, setText] = React.useState(textSize);
  const [mo, setMo] = React.useState(motion);
  const choiceLayout = "min-w-0 @max-[14rem]:[&>div]:flex @max-[14rem]:[&>div]:flex-col";
  return (
    <div className="@container flex flex-col gap-4">
      <ThemeToggle initial={theme} className={choiceLayout} />
      <ChoiceGroup
        className={choiceLayout}
        legend="Размер текста"
        value={text}
        options={[
          { value: "standard", label: "Стандартный" },
          { value: "large", label: "Крупный" },
        ]}
        onChange={(v) => {
          setText(v);
          remember(TEXT_COOKIE, "text", v);
        }}
      />
      <ChoiceGroup
        className={choiceLayout}
        legend="Анимации"
        value={mo}
        options={[
          { value: "system", label: "Как на устройстве" },
          { value: "reduce", label: "Меньше анимации" },
        ]}
        onChange={(v) => {
          setMo(v);
          remember(MOTION_COOKIE, "motion", v);
        }}
      />
    </div>
  );
}
