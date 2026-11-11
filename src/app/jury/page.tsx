import type { Metadata } from "next";
import Link from "next/link";
import { DEMO_ACCOUNTS, JURY_ACCOUNTS } from "@db/seed/demo-credentials";
import { DemoReset } from "@/components/jury/demo-reset";
import { InstallSteps } from "@/components/offline/install-guide";
import { PublicFooter } from "@/components/shell/footer-links";

// «Для жюри» (SPEC §6.12, AC-12.1, AC-12.2). Логины и публичные пароли вымышленных аккаунтов берутся
// из db/seed/demo-credentials.ts — того же файла, по которому сид создаёт аккаунты, поэтому они не разойдутся.

export const metadata: Metadata = {
  title: "Для жюри — Компас",
  description: "Тестовые аккаунты, маршрут проверки на 5 минут и что смотреть по каждому критерию",
};

const ROUTE: { text: React.ReactNode }[] = [
  {
    text: (
      <>
        Войдите как Аня (<Link href="/login">кнопка на экране входа</Link>) и посмотрите «Сегодня»:
        у Ани сегодня перенесена пара, а один дедлайн горит.
      </>
    ),
  },
  {
    text: (
      <>Откройте «Учёба»: по одной дисциплине у Ани риск, там же видно, что предлагается сделать.</>
    ),
  },
  {
    text: <>Закажите справку об обучении: «Заявки» → «Заказать справку» → «Справка об обучении».</>,
  },
  {
    text: (
      <>
        Во второй вкладке (или в режиме инкогнито) войдите как Елена Сергеевна. Возьмите заявку в
        работу и нажмите «Готово».
      </>
    ),
  },
  {
    text: (
      <>Вернитесь к Ане: справка готова, скачайте PDF и проверьте QR-код на странице проверки.</>
    ),
  },
  {
    text: (
      <>
        <strong>Проверьте безопасность.</strong> Скопируйте адрес заявки Ани, войдите как Максим и
        откройте этот адрес: вы увидите «Заявка не найдена».
      </>
    ),
  },
  {
    text: (
      <>
        Включите режим полёта и откройте «Сегодня» и «Документы»: данные и скачанный PDF на месте.
        Подайте заявку без сети, она отправится, когда сеть вернётся.
      </>
    ),
  },
];

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
        Всё работает на телефоне, данные сохраняются. Безопасность проверяется вручную (шаг 6) и
        автотестами: <Link href="/security">«Безопасность»</Link>. Работа без интернета — шаг 7.
      </>
    ),
  },
  {
    name: "Качество",
    what: (
      <>
        Одинаковые состояния «загрузка, пусто, ошибка, нет сети» на каждом экране, светлая и тёмная
        темы, крупный текст в профиле, доступность с клавиатуры и читалкой экрана.
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
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12 outline-none"
      >
        <header className="flex flex-col gap-2">
          <h1 className="type-h1">Для жюри</h1>
          <p className="type-body text-ink-2">
            Компас — концепт для MGIMO AI Challenge 2026. Все аккаунты и данные вымышленные, поэтому
            пароли открыты.
          </p>
        </header>

        <section aria-labelledby="accounts-title" className="flex flex-col gap-3">
          <h2 id="accounts-title" className="type-h2">
            Тестовые аккаунты
          </h2>
          <ul className="flex flex-col gap-3">
            {JURY_ACCOUNTS.map((a) => (
              <li key={a.key} className="rounded-card border border-line bg-surface p-4">
                <p className="type-h3">{a.name}</p>
                <p className="text-ink-2">{a.who}</p>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt className="text-ink-2">Логин</dt>
                  <dd>
                    <code className="font-mono">{DEMO_ACCOUNTS[a.key].login}</code>
                  </dd>
                  <dt className="text-ink-2">Пароль</dt>
                  <dd>
                    <code className="font-mono">{DEMO_ACCOUNTS[a.key].password}</code>
                  </dd>
                </dl>
                <p className="mt-2">{a.data}</p>
              </li>
            ))}
          </ul>
          <p className="type-caption text-ink-2">
            На экране входа есть кнопки «Войти как…»: они подставляют эти же логин и пароль и
            нажимают «Войти». Отдельного входа в обход пароля нет. В демо-аккаунтах смена пароля
            отключена, чтобы все члены жюри могли войти.
          </p>
        </section>

        <section aria-labelledby="route-title" className="flex flex-col gap-3">
          <h2 id="route-title" className="type-h2">
            Маршрут проверки на 5 минут
          </h2>
          <ol className="list-decimal space-y-2 pl-5">
            {ROUTE.map((step, i) => (
              <li key={i}>{step.text}</li>
            ))}
          </ol>
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

        <section aria-labelledby="reset-title" className="flex flex-col gap-3">
          <h2 id="reset-title" className="type-h2">
            Сбросить демо-данные
          </h2>
          <p>
            Испортили данные или хотите пройти маршрут заново? Сброс возвращает демо-аккаунты к
            исходному состоянию и пересчитывает даты от сегодняшнего дня. Не чаще раза в 5 минут;
            входить нужно будет заново.
          </p>
          <DemoReset />
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
            Ошибка в данных студента (ФИО, группа): войдите как студент и откройте «Профиль» →
            «Нашли ошибку в данных?». Так поступит любой студент, и заявка попадёт в очередь
            сотрудника. Ошибка в самом приложении: напишите нам в репозиторий проекта (раздел
            Issues), ссылка — в сопроводительном PDF.
          </p>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
