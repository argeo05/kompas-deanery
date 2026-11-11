import type { Metadata } from "next";
import Link from "next/link";
import { PublicFooter } from "@/components/shell/footer-links";
import { Proof } from "@/components/shell/proof";

// «О проекте» (SPEC §6.12): дисклеймер, проблема и решение, шесть ставок с источниками (#research),
// как проект сделан с ИИ (#ai), лицензии. Только то, что есть в продукте; рядом — файлы с кодом и тестами.

export const metadata: Metadata = {
  title: "О проекте — Компас",
  description:
    "Концепт цифрового деканата для MGIMO AI Challenge 2026: проблема, решение и источники",
};

const BETS: { title: string; text: string; sources: string[]; code: string[] }[] = [
  {
    title: "Главная «Сегодня»",
    text: "Первый экран отвечает на вопрос дня: что сейчас, где и что горит. Следующая пара с отсчётом, переносы, ближайшие дедлайны и новые статусы заявок.",
    sources: ["R1"],
    code: ["src/server/services/today.ts", "tests/e2e/student-today.spec.ts"],
  },
  {
    title: "Работа без интернета",
    text: "Расписание, оценки, заявки и скачанные справки сохраняются на телефоне и открываются без сети. Заявка, поданная офлайн, отправляется сама, когда сеть вернётся.",
    sources: ["R20"],
    code: ["src/lib/offline", "src/sw", "tests/e2e/offline.spec.ts"],
  },
  {
    title: "Заявки как посылки и кабинет сотрудника",
    text: "Статус, срок и история видны студенту, а сотрудник обрабатывает ту же заявку в своём кабинете. Справка выдаётся в виде PDF с QR-кодом для проверки подлинности.",
    sources: ["R6"],
    code: ["src/lib/request-fsm.ts", "src/app/staff", "tests/e2e/student-requests.spec.ts"],
  },
  {
    title: "Уведомления без шума",
    text: "Несрочное приходит дайджестом в выбранные часы, срочное (перенос пары) сразу. Полностью выключить всё нельзя, зато есть режим «только срочное».",
    sources: ["R5"],
    code: ["src/lib/digest.ts", "tests/unit/digest.test.ts"],
  },
  {
    title: "Безопасность, которую можно проверить",
    text: "Чужая заявка не открывается ни по ссылке, ни через программный интерфейс. Это проверяется автоматически и вручную, на странице «Безопасность» есть пошаговая проверка.",
    sources: ["R10", "R11", "R12"],
    code: ["tests/security/idor.spec.ts", "tests/security/rls.spec.ts"],
  },
  {
    title: "Демо без помех друг другу",
    text: "Данные демо-аккаунтов можно сбросить на странице «Для жюри» и пройти маршрут заново. Личных песочниц для каждого эксперта пока нет.",
    sources: [],
    code: ["src/server/services/demo-reset.ts", "tests/integration/profile.test.ts"],
  },
];

const SOURCES: { id: string; text: string; href: string }[] = [
  {
    id: "R1",
    text: "Alfa Research Center. UX-исследование личного кабинета студента РАНХиГС (2026, 32 респондента, айтрекинг).",
    href: "https://tproger.ru/articles/kak-proveryat-produkt-na-ux-na-primere-lichnogo-kabineta-studenta",
  },
  {
    id: "R5",
    text: "Fitz N. и др. Batching smartphone notifications can improve well-being. Computers in Human Behavior, 2019.",
    href: "https://scholars.duke.edu/publication/1402953",
  },
  {
    id: "R6",
    text: "Buell R., Norton M. The Labor Illusion: How Operational Transparency Increases Perceived Value. Management Science, 2011.",
    href: "https://ideas.repec.org/a/inm/ormnsc/v57y2011i9p1564-1579.html",
  },
  {
    id: "R10",
    text: "CVE-2025-48757: недостаточные политики RLS в приложениях, собранных ИИ.",
    href: "https://cvemon.intruder.io/cves/CVE-2025-48757",
  },
  {
    id: "R11",
    text: "Обзор аудитов вайб-кода (Escape.tech, 5 600 приложений).",
    href: "https://rockingtech.co.uk/blog/your-lovable-app-hit-a-wall",
  },
  {
    id: "R12",
    text: "OWASP Top 10:2025, A01 Broken Access Control.",
    href: "https://owasp.org/Top10/",
  },
  {
    id: "R17",
    text: "W3C. Web Content Accessibility Guidelines 2.2.",
    href: "https://www.w3.org/TR/WCAG22/",
  },
  {
    id: "R20",
    text: "Vigo / comss.ru: около 70% мобильных сессий в центре России идут в режиме «белых списков» (июль 2026).",
    href: "https://www.comss.ru/page.php?id=21504",
  },
  {
    id: "R41",
    text: "КА «Университеты и маркетинг», ГК IPR. Образовательная среда будущего: взгляд студентов (2026, n = 6 820, 48 вузов).",
    href: "https://www.univermark.ru/blog/lur7avzm31-obrazovatelnaya-sreda-universiteta-ot-ts",
  },
];

const AI_LINES = [
  "Спецификация (около 2 400 строк) и принятые решения лежат в репозитории и служат источником истины для агентов.",
  "Правила для агентов собраны в CLAUDE.md и в папке .claude: хуки, правила по UI и API.",
  "Четыре субагента проверяют работу: безопасность, доступность, тексты и соответствие спецификации.",
  "Каждая сессия пишет журнал: что сделано, где ИИ ошибся и как это поймали (docs/ai-log).",
  "Часть задач выполняла вторая модель по готовым контрактам, а Claude принимал результат по тестам.",
];

export default function AboutPage() {
  return (
    <>
      <main
        id="content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12 outline-none"
      >
        <header className="flex flex-col gap-3">
          <h1 className="type-h1">О проекте</h1>
          <p className="rounded-card border border-line bg-surface-2 p-4">
            Концепт для конкурса MGIMO AI Challenge 2026. Не является официальным сервисом
            какого-либо вуза. Все персональные данные вымышлены. Логотипы вузов не используются.
          </p>
        </header>

        <section aria-labelledby="problem-title" className="flex flex-col gap-2">
          <h2 id="problem-title" className="type-h2">
            Проблема и решение
          </h2>
          <p>
            Студент узнаёт о переносе пары из чата, ищет оценки в одной системе, а справку
            заказывает в другой и не знает, на каком она этапе. Компас собирает это в одном месте:
            расписание, учёба, заявки и объявления связаны между собой, а перенос пары появляется
            сразу на главной, в расписании и в уведомлениях.
          </p>
          <p>
            Со стороны вуза у заявки есть живой кабинет сотрудника, поэтому статусы настоящие, а не
            нарисованные. Попробуйте сами: <Link href="/jury">маршрут проверки на 5 минут</Link>.
          </p>
        </section>

        <section
          id="research"
          aria-labelledby="bets-title"
          className="flex scroll-mt-20 flex-col gap-4"
        >
          <h2 id="bets-title" className="type-h2">
            Ставки и исследования
          </h2>
          <p className="text-ink-2">
            Каждое решение опирается на исследование или наблюдение из индустрии. Номера в скобках —
            источники ниже.
          </p>
          <ol className="flex flex-col gap-5">
            {BETS.map((b, i) => (
              <li key={b.title} className="flex flex-col gap-1">
                <h3 className="type-h3">
                  {i + 1}. {b.title}
                  {b.sources.length > 0 && (
                    <span className="type-caption font-normal text-ink-2">
                      {" "}
                      ({b.sources.join(", ")})
                    </span>
                  )}
                </h3>
                <p>{b.text}</p>
                <Proof label="Код и тесты" files={b.code} />
              </li>
            ))}
          </ol>
          <h3 className="type-h3">Источники</h3>
          <ul className="flex flex-col gap-2">
            {SOURCES.map((s) => (
              <li key={s.id}>
                <span className="font-semibold">{s.id}.</span> {s.text}{" "}
                <a href={s.href} rel="noopener noreferrer" target="_blank">
                  Открыть источник
                  <span className="sr-only"> {s.id} в новой вкладке</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="type-caption text-ink-2">
            Собственный опрос мы не проводили и ответы не придумывали: использованы опубликованные
            данные национального исследования (R41) и UX-исследования (R1).
          </p>
        </section>

        <section id="ai" aria-labelledby="ai-title" className="flex scroll-mt-20 flex-col gap-2">
          <h2 id="ai-title" className="type-h2">
            Как это сделано с ИИ
          </h2>
          <ol className="list-decimal space-y-1 pl-5">
            {AI_LINES.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ol>
          <p>Подробности и промпты — в репозитории проекта и в сопроводительном PDF.</p>
        </section>

        <section aria-labelledby="lic-title" className="flex flex-col gap-2">
          <h2 id="lic-title" className="type-h2">
            Лицензии
          </h2>
          <p>
            Сторонние библиотеки, шрифты и иллюстрации разрешённых лицензий (MIT, ISC, Apache-2.0,
            BSD, OFL). Полный список с версиями — в файле{" "}
            <code className="font-mono">LICENSES.md</code> в репозитории.
          </p>
          <p>
            Дальше: <Link href="/security">как устроена безопасность</Link> ·{" "}
            <Link href="/jury">для жюри</Link>.
          </p>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
