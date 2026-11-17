"use client";

import * as React from "react";
import { FileText, Sun, WifiOff, type LucideIcon } from "lucide-react";
import { useStudent } from "@/components/shell/student-context";
import { Button } from "@/components/ui/button";
import { CheckRow } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import type { MeDTO, NotificationPrefsDTO } from "@/contracts/api";
import { isOfflineStoreEnabled, setOfflineStoreEnabled } from "@/lib/offline/prefs";
import { sendJson } from "@/lib/send-json";
import { useApi } from "@/lib/use-api";

// Тур при первом входе (SPEC §6.1 п.6, US-1.3): 3 шага, можно пропустить. Флаг «тур пройден» хранится
// в профиле (PATCH /api/me). Последний шаг предлагает время дайджеста и офлайн-хранение.
// Показывается и по кнопке «Показать тур» в профиле — тогда флаг не меняется.

const TOUR_EVENT = "kompas:tour";
export const openTour = () => window.dispatchEvent(new Event(TOUR_EVENT));

const SLIDES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Sun,
    title: "Всё о дне на одном экране",
    text: "На «Сегодня» — ближайшая пара, что изменилось и что горит. Расписание, оценки и дедлайны не нужно искать по разным сайтам.",
  },
  {
    icon: FileText,
    title: "Справки — как посылки",
    text: "Закажите справку и следите за статусом: отправлена, в работе, готова. Когда справка будет готова, придёт уведомление, а PDF можно скачать и проверить по QR-коду.",
  },
  {
    icon: WifiOff,
    title: "Работает без интернета",
    text: "Расписание, оценки, заявки и справки сохраняются на телефоне. В метро и в коридоре без сети они откроются, а заявка уйдёт, когда сеть вернётся.",
  },
];

const DIGEST = {
  default: { label: "Обычный: 8:00, 13:00 и 19:00", slots: [480, 780, 1140] },
  evening: { label: "Вечерний: 12:00, 17:30 и 21:30", slots: [720, 1050, 1290] },
} as const;

async function saveDigest(kind: keyof typeof DIGEST) {
  const res = await fetch("/api/me/notification-prefs", { credentials: "same-origin" });
  if (!res.ok) return;
  const p = (await res.json()) as NotificationPrefsDTO;
  await sendJson("PUT", "/api/me/notification-prefs", {
    slots: DIGEST[kind].slots,
    preset: kind,
    quietFrom: p.quietFrom,
    quietTo: p.quietTo,
    immediateCategories: p.immediateCategories,
    disabledCategories: p.disabledCategories,
  });
}

async function markDone() {
  await fetch("/api/me", {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ onboardingDone: true }),
  });
}

export function Onboarding() {
  const { userId } = useStudent();
  const api = useApi<MeDTO>("/api/me", { scope: userId });
  const [open, setOpen] = React.useState(false);
  const [manual, setManual] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [digest, setDigest] = React.useState<keyof typeof DIGEST>("default");
  const [offline, setOffline] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const shown = React.useRef(false);

  // Первый вход: ждём ответ сервера, один раз за жизнь вкладки.
  React.useEffect(() => {
    if (api.data?.onboardingDone === false && !shown.current && !api.stale) {
      shown.current = true;
      queueMicrotask(() => {
        setOffline(isOfflineStoreEnabled());
        setOpen(true);
      });
    }
  }, [api.data, api.stale]);

  React.useEffect(() => {
    const onTour = () => {
      setStep(0);
      setManual(true);
      setOffline(isOfflineStoreEnabled());
      setOpen(true);
    };
    window.addEventListener(TOUR_EVENT, onTour);
    return () => window.removeEventListener(TOUR_EVENT, onTour);
  }, []);

  const close = React.useCallback(
    async (save: boolean) => {
      setBusy(true);
      try {
        if (save) {
          setOfflineStoreEnabled(offline);
          if (digest !== "default") await saveDigest(digest);
        }
        if (!manual) await markDone();
      } catch {
        // Не критично: тур покажется ещё раз при следующем входе.
      } finally {
        setBusy(false);
        setOpen(false);
        setManual(false);
      }
    },
    [digest, manual, offline],
  );

  const last = step === SLIDES.length;
  const slide = SLIDES[step];
  const Icon = slide?.icon;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) void close(false);
      }}
      title={last ? "Две настройки напоследок" : (slide?.title ?? "")}
      description={`Шаг ${step + 1} из ${SLIDES.length + 1}`}
    >
      <div aria-live="polite" className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
        {!last && Icon && (
          <>
            <Icon aria-hidden strokeWidth={1.5} className="size-12 text-accent" />
            <p className="type-body">{slide.text}</p>
          </>
        )}
        {last && (
          <>
            <fieldset className="flex flex-col">
              <legend className="type-body-strong">Когда присылать дайджест</legend>
              <p className="type-caption text-ink-2">
                Несрочные уведомления придут пачкой в эти часы. Время указано по Москве.
              </p>
              {(Object.keys(DIGEST) as (keyof typeof DIGEST)[]).map((k) => (
                <CheckRow
                  key={k}
                  type="radio"
                  name="digest"
                  label={DIGEST[k].label}
                  checked={digest === k}
                  onChange={() => setDigest(k)}
                />
              ))}
            </fieldset>
            <CheckRow
              label="Хранить данные на устройстве"
              hint="Так Компас работает без интернета. Выключить можно в профиле."
              checked={offline}
              onChange={(e) => setOffline(e.target.checked)}
            />
          </>
        )}
        <div className="flex flex-wrap gap-2">
          {last ? (
            <Button loading={busy} onClick={() => void close(true)}>
              Готово
            </Button>
          ) : (
            <Button onClick={() => setStep(step + 1)}>Далее</Button>
          )}
          {!last && (
            <Button variant="ghost" loading={busy} onClick={() => void close(false)}>
              Пропустить
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
