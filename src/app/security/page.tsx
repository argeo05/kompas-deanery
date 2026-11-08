import type { Metadata } from "next";

// Черновик страницы «Безопасность» (SPEC §6.12). Только проверяемые факты: каждый пункт подтверждён
// тестом из репозитория. Оформление и полный текст — этап C8.

export const metadata: Metadata = {
  title: "Безопасность — Компас",
  description: "Как «Компас» защищает ваши данные и как мы это проверяем",
};

const FACTS: { title: string; text: string; proof: string }[] = [
  {
    title: "Пароли",
    text: "Мы храним не пароль, а его хеш (Argon2id, 64 МБ памяти, 3 итерации). Сам пароль в базе не хранится.",
    proof: "tests/integration/auth.test.ts",
  },
  {
    title: "Сессии",
    text: "В базе хранится не сам ключ входа, а его отпечаток (SHA-256). Если копия базы утечёт, по ней нельзя войти в ваш кабинет. Ключ входа в браузере защищён: скрипты его не читают, и он не уходит на чужие сайты.",
    proof: "tests/integration/auth.test.ts, tests/e2e/security-headers.spec.ts",
  },
  {
    title: "Подбор пароля",
    text: "Не больше 5 попыток входа за 30 секунд с одного адреса и не больше 20 неудачных попыток в час для одного логина. Адрес определяем только по нашему прокси-серверу, поэтому подменить его в запросе нельзя.",
    proof: "tests/integration/auth.test.ts",
  },
  {
    title: "Чужие данные",
    text: "Вы видите только свои заявки, оценки и документы. Чужая заявка или документ не открывается: сервис отвечает «не найдено». Тот же запрет действует и в самой базе данных. Все адреса сервиса проверяются автоматически.",
    proof: "tests/security/idor.spec.ts, tests/security/rls.spec.ts",
  },
  {
    title: "Защита браузера",
    text: "Браузер не запускает посторонние скрипты: разрешены только те, что помечены одноразовой меткой от нашего сервера. Включены HSTS (только защищённое соединение), запрет встраивания в чужие страницы и запрет доступа к камере, микрофону и геолокации.",
    proof: "tests/e2e/security-headers.spec.ts",
  },
];

export default function SecurityPage() {
  return (
    <main
      id="content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-12 outline-none"
    >
      <h1 className="type-h1">Безопасность</h1>
      <p>
        Ниже только то, что уже работает и проверено автотестами. В демо все данные вымышленные.
      </p>
      <ul className="flex flex-col gap-4">
        {FACTS.map((fact) => (
          <li key={fact.title}>
            <h2 className="type-h2">{fact.title}</h2>
            <p>{fact.text}</p>
            <p className="type-caption text-ink-2">Проверка: {fact.proof}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
