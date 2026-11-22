import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicFooter } from "@/components/shell/footer-links";
import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { getPageSession } from "@/server/auth/page-session";

export default async function Home() {
  const session = await getPageSession();
  if (session) redirect(session.user.role === "staff" ? "/staff/queue" : "/today");
  return (
    <>
      <main
        id="content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 px-4 py-12 outline-none"
      >
        <Logo />
        <h1 className="type-display">Всё про учёбу — в одном месте</h1>
        <p className="max-w-prose type-body text-ink-2">
          Смотрите расписание и оценки, заказывайте справки и получайте сообщения деканата в личном
          кабинете студента.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <Button asChild size="lg" className="max-w-full whitespace-normal">
            <Link href="/login">Войти в кабинет</Link>
          </Button>
          <Button asChild size="lg" variant="secondary" className="max-w-full whitespace-normal">
            <Link href="/jury">Для жюри</Link>
          </Button>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
