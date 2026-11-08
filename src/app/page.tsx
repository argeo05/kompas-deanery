import { Logo } from "@/components/shell/logo";

// Временная главная концепта. Лендинг (SPEC §6.12) и экран «Сегодня» (§6.2) — этапы C3 и C8.
export default function Home() {
  return (
    <main
      id="content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 px-4 py-16 outline-none"
    >
      <Logo />
      <h1 className="font-display text-3xl lg:text-4xl">Всё про учёбу — в одном месте</h1>
      <p className="text-lg text-ink-2">
        Личный кабинет студента: расписание, оценки, справки и связь с деканатом. Концепт для MGIMO
        AI Challenge.
      </p>
    </main>
  );
}
