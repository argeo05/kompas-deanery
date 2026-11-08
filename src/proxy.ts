import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@/server/auth";

// Proxy (бывший middleware, Next 16) для группы /staff/* (SPEC §10.3, AC-9.1):
// гость → /login, не сотрудник → экран «Раздел для сотрудников» со статусом 403.
// Это первый рубеж и UX. Страницы и /api/staff/* всё равно проверяют роль на сервере (requireStaff).
//
// Экран отдаём ответом прямо отсюда: NextResponse.rewrite(url, { status: 403 }) в рантайме Next
// возвращает 200 (статус rewrite игнорируется) — проверено на standalone-сборке, D-002.

const FORBIDDEN_HTML = `<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Раздел для сотрудников — Компас</title></head>
<body>
<main>
<h1>Раздел для сотрудников</h1>
<p>Этот раздел открыт только сотрудникам деканата.</p>
<p><a href="/">Вернуться на главную</a></p>
</main>
</body>
</html>`;

export async function proxy(req: NextRequest) {
  const session = await getAuth().api.getSession({ headers: req.headers });
  if (!session) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  if (session.user.role !== "staff") {
    return new NextResponse(FORBIDDEN_HTML, {
      status: 403,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/staff/:path*"] };
