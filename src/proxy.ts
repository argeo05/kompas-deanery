import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, createNonce, staticSecurityHeaders } from "@/lib/security-headers";
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

/** Путь без повторных слэшей, в нижнем регистре и с раскодированными %-символами: обход по записи не работает. */
function normalizedPath(req: NextRequest): string {
  let path = req.nextUrl.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // Битая %-последовательность: оставляем как есть, ниже путь всё равно не совпадёт с /staff.
  }
  return path.replace(/\/{2,}/g, "/").toLowerCase();
}

/** Проверка доступа к /staff/*; null — пропустить дальше. */
async function guardStaff(req: NextRequest): Promise<NextResponse | null> {
  const session = await getAuth().api.getSession({ headers: req.headers });
  if (!session) {
    // Адрес строим от BETTER_AUTH_URL, а не из req.url: за прокси внутренний хост контейнера не должен попасть в Location.
    const login = new URL("/login", process.env.BETTER_AUTH_URL ?? req.url);
    login.searchParams.set("next", normalizedPath(req));
    return NextResponse.redirect(login);
  }
  if (session.user.role !== "staff") {
    return new NextResponse(FORBIDDEN_HTML, {
      status: 403,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return null;
}

/**
 * Для каждой страницы: свежий nonce и CSP (SPEC §9.6). Next читает nonce из CSP запроса и
 * проставляет его своим скриптам; в ответ CSP уходит браузеру. Ответы proxy (403, редирект)
 * получают ту же политику.
 */
export async function proxy(req: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp(nonce);
  const withCsp = (res: NextResponse) => {
    res.headers.set("Content-Security-Policy", csp);
    // Ответы самого proxy (редирект, 403) next.config headers() не получают.
    for (const { key, value } of staticSecurityHeaders) res.headers.set(key, value);
    return res;
  };

  const path = normalizedPath(req);
  if (path === "/staff" || path.startsWith("/staff/")) {
    const denied = await guardStaff(req);
    if (denied) return withCsp(denied);
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  // Путь нужен layout кабинета: гостя он отправляет на /login?next=<этот путь>.
  requestHeaders.set("x-pathname", req.nextUrl.pathname);
  requestHeaders.set("Content-Security-Policy", csp);
  return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  matcher: [
    // /staff/* проверяем всегда, в том числе на prefetch: иначе RSC-ответ отдался бы без проверки роли.
    "/staff/:path*",
    {
      // Страницы, но не API и статика: у них CSP не нужен.
      source: "/((?!api/|_next/static/|_next/image/|favicon\\.ico$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
