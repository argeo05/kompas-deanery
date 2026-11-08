import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { ApiErrorBody, ErrorCode, ValidationIssue } from "@/contracts/api";

// Общая обвязка обработчиков API (DEEPSEEK-TASKS §2). Образец — src/app/api/me/requests/.
//
//   export const GET = route(async (req) => {
//     const me = await requireStudent(req);              // первая строка
//     const query = parseQuery(req, listQuerySchema);    // 422 VALIDATION при ошибке
//     ...
//     return ok(data);
//   });
//
// route() ловит HttpError (их бросают guards, parseJson, parseQuery, notFound) и превращает в fail(),
// проверяет Origin у изменяющих запросов, а неожиданные ошибки отдаёт как 500 INTERNAL без подробностей.

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 64 * 1024;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    readonly details?: unknown,
  ) {
    super(code);
  }
}

/** Успешный ответ. Личные данные не кэшируются браузером и прокси. */
export function ok<T>(data: T, init?: ResponseInit): NextResponse<T> {
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(NO_STORE)) if (!headers.has(k)) headers.set(k, v);
  return NextResponse.json(data, { ...init, headers });
}

/** 204 без тела. */
export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}

/** Ответ с ошибкой в формате { error: { code, details? } }. */
export function fail(
  status: number,
  code: ErrorCode,
  details?: unknown,
): NextResponse<ApiErrorBody> {
  const error: ApiErrorBody["error"] = details === undefined ? { code } : { code, details };
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

/** Чужой или несуществующий ресурс — одинаково 404 (SPEC §9.3). */
export function notFound(): never {
  throw new HttpError(404, "NOT_FOUND");
}

export function zodIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((i) => ({ path: i.path.join("."), code: i.code }));
}

/** Тело JSON по схеме Zod. Неверный JSON, слишком большое тело или нарушение схемы → 422 VALIDATION. */
export async function parseJson<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<z.output<S>> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES)
    throw new HttpError(422, "VALIDATION", { reason: "BODY_TOO_LARGE" });
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(422, "VALIDATION", { reason: "INVALID_JSON" });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(422, "VALIDATION", { issues: zodIssues(parsed.error) });
  return parsed.data;
}

/**
 * Query-параметры по схеме Zod. Повторяющийся ключ даёт массив.
 * Лишние ключи (в том числе studentId/userId) схема должна отбрасывать — используйте z.object, не z.looseObject.
 */
export function parseQuery<S extends z.ZodType>(
  source: Request | URL | string,
  schema: S,
): z.output<S> {
  const url = source instanceof Request ? new URL(source.url) : new URL(source);
  const raw: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams) {
    const prev = raw[key];
    raw[key] = prev === undefined ? value : Array.isArray(prev) ? [...prev, value] : [prev, value];
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(422, "VALIDATION", { issues: zodIssues(parsed.error) });
  return parsed.data;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** CSRF: изменяющий запрос должен прийти с нашего origin (SPEC §9.2). */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const allowed = new Set([new URL(req.url).origin]);
  if (process.env.BETTER_AUTH_URL) allowed.add(new URL(process.env.BETTER_AUTH_URL).origin);
  if (!origin || !allowed.has(origin)) throw new HttpError(403, "FORBIDDEN", { reason: "ORIGIN" });
}

type RouteContext<P> = { params: Promise<P> };

export function route<P extends Record<string, string | string[]> = Record<string, never>>(
  handler: (req: NextRequest, ctx: RouteContext<P>) => Promise<Response>,
) {
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<Response> => {
    try {
      if (MUTATING.has(req.method)) assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.code, err.details);
      // В лог — тип ошибки и маршрут, без тела запроса (SPEC §9.4). Текст ошибки — только вне production.
      const detail =
        process.env.NODE_ENV === "production" ? "" : String((err as Error)?.message ?? err);
      console.error(
        "api: необработанная ошибка",
        req.method,
        new URL(req.url).pathname,
        (err as Error)?.name,
        detail,
      );
      return fail(500, "INTERNAL");
    }
  };
}
