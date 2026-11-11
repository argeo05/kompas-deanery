import type { Metadata } from "next";
import Link from "next/link";
import { PublicFooter } from "@/components/shell/footer-links";
import { Proof } from "@/components/shell/proof";

// «Безопасность простыми словами» (SPEC §6.12). Только проверяемые факты: у каждого пункта указаны файлы
// кода и тесты в репозитории, которые это подтверждают. Текст переносится в PDF.

export const metadata: Metadata = {
  title: "Безопасность — Компас",
  description: "Как «Компас» защищает ваши данные и как мы это проверяем",
};

const FACTS: { title: string; text: string; code: string[]; tests: string[] }[] = [
  {
    title: "Пароли",
    text: "Мы храним не пароль, а его хеш (Argon2id, 64 МБ памяти, 3 итерации). Поэтому даже мы не знаем ваш пароль. Неверный логин и неверный пароль дают один и тот же ответ.",
    code: ["src/server/auth/password.ts"],
    tests: ["tests/integration/auth.test.ts"],
  },
  {
    title: "Сеансы",
    text: "В базе хранится не сам ключ входа, а его отпечаток (SHA-256). Если копия базы утечёт, по ней нельзя войти в ваш кабинет. Ключ входа в браузере защищён: скрипты страницы его не читают, и он не уходит на чужие сайты. «Выйти на всех устройствах» в профиле закрывает все сеансы сразу.",
    code: ["src/server/auth/session-token-hash.ts", "src/server/repositories/sessions.ts"],
    tests: ["tests/integration/auth.test.ts", "tests/integration/profile.test.ts"],
  },
  {
    title: "Подбор пароля",
    text: "Не больше 5 попыток входа за 30 секунд с одного адреса и не больше 20 неудачных попыток в час для одного логина. Адрес определяем только по нашему прокси-серверу, поэтому подменить его в запросе нельзя.",
    code: ["src/server/auth/index.ts", "src/server/auth/client-ip.ts"],
    tests: ["tests/integration/auth.test.ts"],
  },
  {
    title: "Чужие данные",
    text: "Вы видите только свои заявки, оценки и документы. Чужая заявка или документ не открывается: сервис отвечает «не найдено». Номер студента берётся только из вашего сеанса, подставить чужой в адрес или запрос нельзя. Тот же запрет действует и в самой базе данных (политики RLS). Автотесты перебирают все адреса сервиса и проверяют, что чужие данные не открываются.",
    code: ["src/server/db.ts", "db/migrations/0001_rls.sql", "src/server/auth/guards.ts"],
    tests: ["tests/security/idor.spec.ts", "tests/security/rls.spec.ts"],
  },
  {
    title: "Разделение ролей",
    text: "Студент не открывает кабинет сотрудника: страницы отвечают «Раздел для сотрудников», программный интерфейс — «запрещено». Сотрудник видит заявки своего подразделения и не видит оценок. Все действия сотрудника записываются в журнал.",
    code: ["src/proxy.ts", "src/server/audit.ts"],
    tests: ["tests/security/idor.spec.ts", "tests/e2e/staff.spec.ts"],
  },
  {
    title: "Защита браузера",
    text: "Браузер не запускает посторонние скрипты: разрешены только те, что помечены одноразовой меткой от нашего сервера. Включены HSTS (только защищённое соединение), запрет встраивания в чужие страницы и запрет доступа к камере, микрофону и геолокации.",
    code: ["src/lib/security-headers.ts", "src/proxy.ts"],
    tests: ["tests/e2e/security-headers.spec.ts"],
  },
  {
    title: "Ввод и вывод",
    text: "Сервер проверяет всё, что приходит от браузера, по строгим схемам; лишние поля отбрасываются. Текст объявлений и сообщений не может выполнить скрипт: проверено на 11 типичных способах внедрения кода.",
    code: ["src/server/schemas", "src/lib/markdown.tsx"],
    tests: ["tests/unit/markdown.test.tsx", "tests/e2e/student-c5.spec.ts"],
  },
  {
    title: "Проверка справки по QR",
    text: "Страница проверки подлинности не показывает ни ФИО, ни номер заявки: только факт, что документ выдан, и дату. Частота проверок ограничена, подобрать код нельзя.",
    code: ["src/app/verify", "src/server/verify-limit.ts"],
    tests: ["tests/integration/verify.test.ts"],
  },
  {
    title: "Секреты",
    text: "Ключи и пароли сервисов лежат только на сервере, в переменных окружения. Перед каждым коммитом репозиторий проверяется сканером секретов, поэтому ключ не попадёт в историю.",
    code: [".gitleaks.toml", ".githooks"],
    tests: [],
  },
  {
    title: "Данные на телефоне",
    text: "Для работы без интернета Компас хранит на устройстве ваше расписание, оценки, заявки и справки. Они привязаны к вашему аккаунту: при выходе стираются сразу, даже без сети, а если на том же телефоне войдёт другой человек, старые данные удаляются. Сами страницы кабинета на телефон не сохраняются — только данные, которые Компас записывает сам. В профиле хранение можно выключить, а сохранённое очистить.",
    code: ["src/lib/offline/device-data.ts", "src/lib/offline/sign-out.ts"],
    tests: ["tests/e2e/offline.spec.ts"],
  },
  {
    title: "Ваши данные — у вас",
    text: "В профиле можно посмотреть, что хранится и зачем, увидеть, где вы вошли, и скачать все свои данные одним файлом.",
    code: ["src/app/api/me/export/route.ts", "src/app/api/me/sessions/route.ts"],
    tests: ["tests/integration/profile.test.ts"],
  },
];

const LIMITS = [
  "Это концепт: данные вымышленные, а реальных персональных данных в системе нет.",
  "Пароли демо-аккаунтов открыты намеренно (так требует задание); в них нельзя сменить пароль.",
  "Счётчики ограничения частоты хранятся в памяти одного серверного процесса. При нескольких серверах их нужно переносить в базу данных.",
  "Двухфакторного входа нет: в концепте он не нужен, в настоящем сервисе потребуется.",
];

export default function SecurityPage() {
  return (
    <>
      <main
        id="content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-12 outline-none"
      >
        <h1 className="type-h1">Безопасность</h1>
        <p>
          Ниже только то, что уже работает и проверено автотестами. Рядом с каждым пунктом указаны
          файлы с кодом и тестами: их можно открыть в репозитории. Чтобы запустить проверки изоляции
          данных самому: <code className="font-mono">pnpm test:security</code>.
        </p>
        <section
          aria-labelledby="try-title"
          className="rounded-card border border-line bg-surface p-4"
        >
          <h2 id="try-title" className="type-h3">
            Проверьте вручную за минуту
          </h2>
          <p>
            Войдите как Аня, откройте любую заявку и скопируйте адрес из строки браузера. Выйдите,
            войдите как Максим и откройте этот адрес: вы увидите «Заявка не найдена». Логины и
            пароли — на странице <Link href="/jury">«Для жюри»</Link>.
          </p>
        </section>
        <ul className="flex flex-col gap-6">
          {FACTS.map((fact) => (
            <li key={fact.title} className="flex flex-col gap-1">
              <h2 className="type-h2">{fact.title}</h2>
              <p>{fact.text}</p>
              <Proof label="Код" files={fact.code} />
              {fact.tests.length > 0 && <Proof label="Тесты" files={fact.tests} />}
            </li>
          ))}
        </ul>
        <section aria-labelledby="limits-title" className="flex flex-col gap-2">
          <h2 id="limits-title" className="type-h2">
            Чего здесь нет
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            {LIMITS.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
