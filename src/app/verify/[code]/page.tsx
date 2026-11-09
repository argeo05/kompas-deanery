import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { CircleCheck, CircleSlash, CircleX, Hourglass } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { VerifyDTO } from "@/contracts/api";
import { getClientIp } from "@/server/auth/client-ip";
import { getDb } from "@/server/db";
import { checkVerifyCode } from "@/server/services/documents";
import { consumeVerifyLimit } from "@/server/verify-limit";

// Публичная проверка подлинности справки (SPEC §6.5 п.9, AC-5.5). Без входа, без личных данных:
// только тип документа, дата выдачи и «действителен / отозван / не найден». Тот же лимит, что у API.

export const metadata: Metadata = {
  title: "Проверка документа — Компас",
  description: "Проверьте, что справка выдана через «Компас»",
  robots: { index: false, follow: false },
};

const issuedFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "numeric",
  month: "long",
  year: "numeric",
});

type Outcome = VerifyDTO | { limited: true };

async function check(code: string): Promise<Outcome> {
  const ip = getClientIp(await headers());
  if (!(await consumeVerifyLimit(ip))) return { limited: true };
  if (code.length === 0 || code.length > 256) return { found: false };
  return getDb().transaction((tx) => checkVerifyCode(tx, code));
}

function Verdict({ outcome }: { outcome: Outcome }) {
  if ("limited" in outcome) {
    return (
      <Card className="gap-2 border-l-4 border-l-warn" role="status">
        <p className="inline-flex items-center gap-2 text-warn-fg">
          <Hourglass aria-hidden className="size-5" />
          <span className="type-caption font-medium">Слишком много проверок</span>
        </p>
        <h1 className="type-h1">Подождите минуту</h1>
        <p className="text-ink-2">
          С вашего адреса было много проверок подряд. Попробуйте ещё раз через минуту.
        </p>
      </Card>
    );
  }
  if (!outcome.found) {
    return (
      <Card className="gap-2 border-l-4 border-l-coral" role="status">
        <p className="inline-flex items-center gap-2 text-coral-fg">
          <CircleX aria-hidden className="size-5" />
          <span className="type-caption font-medium">Не подтверждён</span>
        </p>
        <h1 className="type-h1">Документ не найден</h1>
        <p className="text-ink-2">
          Проверьте, что ссылка скопирована целиком, или отсканируйте QR-код с документа ещё раз.
          Если ссылка верная, этот документ выдан не через «Компас».
        </p>
      </Card>
    );
  }
  const valid = outcome.valid;
  return (
    <Card
      className={valid ? "gap-2 border-l-4 border-l-ok" : "gap-2 border-l-4 border-l-coral"}
      role="status"
    >
      <p
        className={
          valid
            ? "inline-flex items-center gap-2 text-ok-fg"
            : "inline-flex items-center gap-2 text-coral-fg"
        }
      >
        {valid ? (
          <CircleCheck aria-hidden className="size-5" />
        ) : (
          <CircleSlash aria-hidden className="size-5" />
        )}
        <span className="type-caption font-medium">{valid ? "Действителен" : "Отозван"}</span>
      </p>
      <h1 className="type-h1">{valid ? "Документ найден" : "Документ найден, но отозван"}</h1>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-ink-2">Тип</dt>
        <dd data-testid="verify-type">{outcome.typeTitle}</dd>
        <dt className="text-ink-2">Выдан</dt>
        <dd data-testid="verify-issued">{issuedFormat.format(new Date(outcome.issuedAt))}</dd>
      </dl>
      {!valid && (
        <p className="text-ink-2">Использовать такой документ нельзя: его отозвали после выдачи.</p>
      )}
    </Card>
  );
}

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const outcome = await check(code);
  return (
    <main
      id="content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8 outline-none"
    >
      <Verdict outcome={outcome} />
      <section aria-labelledby="verify-shows" className="flex flex-col gap-2">
        <h2 id="verify-shows" className="type-h3">
          Что мы подтверждаем
        </h2>
        <p className="text-ink-2">
          Что документ действительно выдан через «Компас», какого он типа и когда выдан, а также
          действует ли он сейчас.
        </p>
      </section>
      <section aria-labelledby="verify-hides" className="flex flex-col gap-2">
        <h2 id="verify-hides" className="type-h3">
          Чего мы не показываем
        </h2>
        <p className="text-ink-2">
          Имя владельца, группу, номер заявки и содержание справки. Так мы защищаем личные данные.
          Содержание вам может показать сам владелец, у него есть файл.
        </p>
      </section>
      <p className="type-caption text-ink-2">
        «Компас» — учебный концепт: документы здесь образцовые и не имеют юридической силы.{" "}
        <Link href="/" className="text-accent underline">
          На главную
        </Link>
      </p>
    </main>
  );
}
