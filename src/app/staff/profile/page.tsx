import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppearanceSection } from "@/components/profile/appearance-section";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { Card } from "@/components/ui/card";
import {
  MOTION_COOKIE,
  TEXT_COOKIE,
  THEME_COOKIE,
  parseMotion,
  parseTextSize,
  parseTheme,
} from "@/lib/theme";
import { getPageSession } from "@/server/auth/page-session";
import { withUserTx } from "@/server/db";
import { getStaffIdentity } from "@/server/services/staff-reference";

export const metadata: Metadata = { title: "Профиль — Компас" };

// Профиль сотрудника (SPEC §6.1 п.7): имя, подразделение, внешний вид, выход. Роль уже проверена layout.
export default async function StaffProfilePage() {
  const session = await getPageSession();
  const userId = session?.user.id;
  if (!userId) return null;
  const me = await withUserTx(userId, (tx) => getStaffIdentity(tx, userId));
  const jar = await cookies();
  return (
    <>
      <h1 className="type-h1">Профиль</h1>
      <Card className="gap-3 p-4">
        <h2 className="type-h3">Вы</h2>
        <dl className="flex flex-col gap-2">
          <div>
            <dt className="type-caption text-ink-2">Имя</dt>
            <dd>{session.user.name}</dd>
          </div>
          <div>
            <dt className="type-caption text-ink-2">Подразделение</dt>
            <dd>{me.unit}</dd>
          </div>
          <div>
            <dt className="type-caption text-ink-2">Должность</dt>
            <dd>{me.position}</dd>
          </div>
        </dl>
        <p className="type-caption text-ink-2">
          Вы видите заявки и обращения своего подразделения. Оценки студентов сотрудникам не
          показываются.
        </p>
      </Card>
      <Card className="gap-3 p-4">
        <h2 className="type-h3">Внешний вид</h2>
        <AppearanceSection
          theme={parseTheme(jar.get(THEME_COOKIE)?.value)}
          textSize={parseTextSize(jar.get(TEXT_COOKIE)?.value)}
          motion={parseMotion(jar.get(MOTION_COOKIE)?.value)}
        />
      </Card>
      <Card className="gap-3 p-4">
        <h2 className="type-h3">Выход</h2>
        <SignOutButton />
        <p className="type-caption text-ink-2">
          Демо-аккаунты не дают менять пароль, чтобы все члены жюри могли войти.
        </p>
      </Card>
    </>
  );
}
