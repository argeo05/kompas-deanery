import type { Metadata } from "next";
import { InstallSteps } from "@/components/offline/install-guide";

// «Для жюри» (SPEC §6.12). Черновик C7: только установка на телефон и проверка офлайна.
// Демо-аккаунты, сброс демо-данных и сценарии проверки добавит этап C8.

export const metadata: Metadata = {
  title: "Для жюри — Компас",
  description: "Как поставить Компас на телефон и проверить работу без интернета",
};

export default function JuryPage() {
  return (
    <main
      id="content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-12 outline-none"
    >
      <h1 className="type-h1">Для жюри</h1>
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
      <section aria-labelledby="offline-title" className="flex flex-col gap-3">
        <h2 id="offline-title" className="type-h2">
          Проверить работу без интернета
        </h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Войдите как студент и откройте «Сегодня» — Компас сохранит данные, чтобы работать без
            интернета.
          </li>
          <li>Включите режим полёта.</li>
          <li>
            Откройте «Сегодня», расписание на эту и следующую неделю, «Учёбу», «Заявки» и
            «Документы» (скачанный PDF-документ тоже откроется).
          </li>
          <li>
            Подайте заявку без сети: она получит статус «Ожидает отправки» и отправится сама, когда
            появится сеть.
          </li>
          <li>Нажмите «Выйти» без сети — данные на телефоне сотрутся сразу.</li>
        </ol>
      </section>
    </main>
  );
}
