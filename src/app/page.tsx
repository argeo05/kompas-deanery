import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/shell/logo";
import { buttonVariants } from "@/components/ui/button";
import { getPageSession } from "@/server/auth/page-session";

// Временная главная концепта. Полноценный лендинг (SPEC §6.12) — этап C8.
// Вошедший пользователь сразу попадает в свой раздел.
export default async function Home() {
  const session = await getPageSession();
  if (session) redirect(session.user.role === "staff" ? "/staff/queue" : "/today");
  return (
    <main
      id="content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 px-4 py-16 outline-none"
    >
      <Logo />
      <h1 className="type-display">Всё про учёбу — в одном месте</h1>
      <p className="type-body text-ink-2">
        Личный кабинет студента: расписание, оценки, справки и связь с деканатом. Концепт для MGIMO
        AI Challenge.
      </p>
      <div>
        <Link href="/login" className={buttonVariants({ size: "lg" })}>
          Войти
        </Link>
      </div>
    </main>
  );
}
