import type { Metadata } from "next";
import Link from "next/link";
import { DEMO_ACCOUNTS, JURY_ACCOUNTS } from "@db/seed/demo-credentials";
import { Button } from "@/components/ui/button";
import { DemoReset } from "@/components/jury/demo-reset";
import { InstallSteps } from "@/components/offline/install-guide";
import { PublicFooter } from "@/components/shell/footer-links";

// «Для жюри» (SPEC §6.12, AC-12.1, AC-12.2). Логины и публичные пароли вымышленных аккаунтов берутся
// из db/seed/demo-credentials.ts — того же файла, по которому сид создаёт аккаунты, поэтому они не разойдутся.

export const metadata: Metadata = {
  title: "Для жюри — Компас",
  description:
    "Демо-аккаунты студента и сотрудника. Расписание, заказ и выдача справки, проверка PDF без сети.",
};

const ROUTE = [
  {
    title: "Найдите перенос",
    text: "На экране входа нажмите «Войти как Аня», затем на «Сегодня» — «Все пары». Найдите макроэкономику: пара перенесена с 12:40 на 15:20, аудитория 4012. Вечером перенос остаётся в расписании дня, а в воскресенье откройте расписание ближайшего понедельника.",
  },
  {
    title: "Проверьте риск по учёбе",
    text: "Откройте «Учёба». У Ани выделена микроэкономика. Посмотрите, какую долю оставшихся баллов нужно набрать. Во вкладке «Сессия» есть даты экзаменов и консультаций.",
  },
  {
    title: "Закажите справку как Аня",
    text: "«Заявки» → «Заказать: справка об обучении» → «В банк» → «Отправить». Электронный PDF выбран заранее. Нажмите «Перейти к заявке», запомните её номер СП-… и оставьте карточку открытой.",
  },
  {
    title: "Выдайте эту справку как Елена",
    text: "Откройте тот же сайт в другом браузере, на втором устройстве или в приватном окне, если Аня вошла в обычном. У каждой роли должен быть свой сеанс. Нажмите «Войти как Елена Сергеевна». В очереди выберите «Отправлены», найдите номер Ани, откройте карточку и нажмите «Взять в работу», затем «Готово».",
  },
  {
    title: "Проверьте PDF",
    text: "Вернитесь в исходный браузер Ани, обновите карточку и нажмите «Скачать PDF». Проверьте имя и назначение. Пока есть сеть, отсканируйте QR-код или скопируйте напечатанный под ним адрес в браузер, чтобы увидеть статус документа.",
  },
  {
    title: "Откройте справку без сети",
    text: "В том же браузере Ани откройте «Сегодня», затем «Заявки» → «Мои документы». Дождитесь отметки «Есть на телефоне» у скачанной справки. Отключите интернет, обновите «Сегодня» и снова откройте PDF из «Моих документов». После проверки включите интернет.",
  },
  {
    title: "Сравните кабинет Максима",
    text: "Выйдите из профиля Ани и нажмите «Войти как Максим». У него вечерние пары и своя заявка на выписку оценок, по которой сотрудник ждёт уточнения. Смена студента удаляет с устройства личные офлайн-данные Ани.",
  },
] as const;

const CRITERIA: { name: string; what: React.ReactNode }[] = [
  {
    name: "Проработанность идеи",
    what: (
      <>
        «Сегодня» отвечает на вопрос «что сейчас и что горит». Сквозной сценарий справки идёт от
        студента к сотруднику и обратно. Исследования и источники — в{" "}
        <Link href="/about#research">«О проекте»</Link>.
      </>
    ),
  },
  {
    name: "Масштаб использования нейротехнологий",
    what: (
      <>
        Как проект сделан с ИИ: файлы для агентов, проверяющие субагенты, журнал ошибок ИИ — в{" "}
        <Link href="/about#ai">«О проекте»</Link>.
      </>
    ),
  },
  {
    name: "Имплементация",
    what: (
      <>
        Найдите заказанный документ в «Моих документах» и откройте его без сети (шаг 6). Как
        приложение разделяет данные пользователей, описано в разделе{" "}
        <Link href="/security">«Безопасность»</Link>.
      </>
    ),
  },
  {
    name: "Качество",
    what: (
      <>
        В профиле включите крупный текст или тёмную тему. Проверьте, как читаются новое время пары,
        предупреждение по учёбе и статус справки.
      </>
    ),
  },
];

export default function JuryPage() {
  return (
    <>
      <main
        id="content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 outline-none sm:py-12"
      >
        <header className="flex flex-col gap-2">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center self-start underline underline-offset-4"
          >
            На главную
          </Link>
          <h1 className="type-h1">Для жюри</h1>
          <p className="type-body text-ink-2">
            Компас — концепт для MGIMO AI Challenge 2026. Все аккаунты и данные вымышленные, поэтому
            пароли открыты.
          </p>
        </header>

        <section aria-labelledby="route-title" className="flex flex-col gap-3">
          <h2 id="route-title" className="type-h2">
            Маршрут проверки на 5 минут
          </h2>
          <p className="text-ink-2">
            Если у вас пять минут, начните со справки (шаги 3–5). Выберите «Войти как Аня» на экране
            входа.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Button asChild className="max-w-full whitespace-normal">
              <Link href="/login" target="_blank" rel="noopener">
                Открыть вход в новой вкладке
              </Link>
            </Button>
            <Link
              href="#accounts-title"
              className="inline-flex min-h-11 items-center underline underline-offset-4"
            >
              Логины и пароли
            </Link>
          </div>
          <ol className="mt-2 list-decimal space-y-3 pl-6 marker:font-semibold">
            {ROUTE.map((step) => (
              <li key={step.title} className="pl-1">
                <strong>{step.title}.</strong> {step.text}
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="accounts-title" className="flex flex-col gap-3">
          <h2 id="accounts-title" className="type-h2">
            Тестовые аккаунты
          </h2>
          <ul className="flex flex-col gap-3">
            {JURY_ACCOUNTS.map((a) => (
              <li key={a.key} className="rounded-card border border-line bg-surface p-4">
                <p className="type-h3">{a.name}</p>
                <p className="text-ink-2">{a.who}</p>
                <dl className="mt-2 grid min-w-0 gap-x-3 gap-y-1 min-[22rem]:grid-cols-[auto_minmax(0,1fr)]">
                  <dt className="text-ink-2">Логин</dt>
                  <dd className="min-w-0 wrap-anywhere">
                    <code className="font-mono">{DEMO_ACCOUNTS[a.key].login}</code>
                  </dd>
                  <dt className="text-ink-2">Пароль</dt>
                  <dd className="min-w-0 wrap-anywhere">
                    <code className="font-mono">{DEMO_ACCOUNTS[a.key].password}</code>
                  </dd>
                </dl>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="criteria-title" className="flex flex-col gap-3">
          <h2 id="criteria-title" className="type-h2">
            Что смотреть по каждому критерию
          </h2>
          <dl className="flex flex-col gap-3">
            {CRITERIA.map((c) => (
              <div key={c.name}>
                <dt className="type-body-strong">{c.name}</dt>
                <dd className="text-ink-2">{c.what}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="install-title" className="flex flex-col gap-3">
          <h2 id="install-title" className="type-h2">
            Установить на телефон
          </h2>
          <p>
            Компас можно установить на телефон как приложение: после этого он открывается с главного
            экрана, без адресной строки браузера.
          </p>
          <InstallSteps />
        </section>

        <section aria-labelledby="bug-title" className="flex flex-col gap-2">
          <h2 id="bug-title" className="type-h2">
            Нашли ошибку
          </h2>
          <p>
            Чтобы исправить ФИО или группу, студент может открыть «Профиль» → «Нашли ошибку в
            данных?». Обращение попадёт в очередь сотрудника.
          </p>
        </section>
        {process.env.DEMO_RESET_ENABLED !== "false" && (
          <section
            aria-labelledby="reset-title"
            className="flex flex-col gap-3 border-t border-line pt-5"
          >
            <h2 id="reset-title" className="type-h2">
              Общий сброс демо-данных
            </h2>
            <p>
              Сброс удалит заявки, созданные участниками показа, и завершит все их сеансы. Чтобы
              пройти маршрут ещё раз, достаточно отправить новую заявку и записать её номер.
            </p>
            <DemoReset />
          </section>
        )}
      </main>
      <PublicFooter />
    </>
  );
}
