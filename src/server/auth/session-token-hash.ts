import "server-only";
import { createHash } from "node:crypto";
import type { drizzleAdapter } from "better-auth/adapters/drizzle";

// Хеширование токена сессии в БД (SPEC §9.2, D-002 → D-005).
// Better Auth 1.7 штатно хранит токен как есть, а cookie подписывает HMAC от того же значения.
// Обёртка над адаптером БД: в строке `sessions.token` лежит SHA-256 от токена, а Better Auth
// и cookie видят исходный токен. Утечка БД (дамп, SQL-инъекция, бэкап) не даёт угнать сессии:
// чтобы подставить токен в cookie, нужен его прообраз.
//
// Что делает обёртка для модели `session`:
//   create     — сохраняет хеш, возвращает вызывающему исходный токен;
//   where      — условия по полю token (eq и in) переписывает на хеш;
//   результаты — токен подменяется на исходный, если он известен из условия поиска.
// Списки сессий по userId (findMany без условия по token) вернут хеши: по ним войти нельзя,
// а маршруты list-sessions/revoke-session мы не используем.

type Base = ReturnType<ReturnType<typeof drizzleAdapter>>;
type AnyArgs = Record<string, unknown> & { model: string };
interface WhereClause {
  field: string;
  value: unknown;
  operator?: string;
}

const SESSION_MODEL = "session";
const READ_WRITE_METHODS = [
  "findOne",
  "findMany",
  "update",
  "consumeOne",
  "incrementOne",
  "delete",
  "deleteMany",
  "updateMany",
  "count",
] as const;

/** SHA-256 в hex: токен случайный и длинный, соль и медленный хеш здесь не нужны. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function rewriteWhere(
  where: WhereClause[] | undefined,
  rawByHash: Map<string, string>,
): WhereClause[] | undefined {
  return where?.map((clause) => {
    if (clause.field !== "token") return clause;
    const toHash = (raw: unknown) => {
      if (typeof raw !== "string") return raw;
      const hash = hashSessionToken(raw);
      rawByHash.set(hash, raw);
      return hash;
    };
    return {
      ...clause,
      value: Array.isArray(clause.value) ? clause.value.map(toHash) : toHash(clause.value),
    };
  });
}

function restoreToken<T>(row: T, rawByHash: Map<string, string>): T {
  if (!row || typeof row !== "object") return row;
  const token = (row as { token?: unknown }).token;
  const raw = typeof token === "string" ? rawByHash.get(token) : undefined;
  return raw ? ({ ...row, token: raw } as T) : row;
}

export function withHashedSessionTokens(base: Base): Base {
  const handlers: Record<string, (args: AnyArgs) => Promise<unknown>> = {};

  for (const method of READ_WRITE_METHODS) {
    handlers[method] = async (args) => {
      const original = (base as unknown as Record<string, (a: AnyArgs) => Promise<unknown>>)[
        method
      ];
      if (args.model !== SESSION_MODEL) return original.call(base, args);
      const rawByHash = new Map<string, string>();
      const where = rewriteWhere(args.where as WhereClause[] | undefined, rawByHash);
      const result = await original.call(base, { ...args, where });
      return Array.isArray(result)
        ? result.map((row) => restoreToken(row, rawByHash))
        : restoreToken(result, rawByHash);
    };
  }

  handlers.create = async (args) => {
    if (args.model !== SESSION_MODEL) return base.create(args as never);
    const data = args.data as { token?: string };
    if (typeof data.token !== "string") return base.create(args as never);
    const rawByHash = new Map([[hashSessionToken(data.token), data.token]]);
    const result = await base.create({
      ...args,
      data: { ...data, token: hashSessionToken(data.token) },
    } as never);
    return restoreToken(result, rawByHash);
  };

  return new Proxy(base, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && prop in handlers) return handlers[prop];
      if (prop === "transaction") {
        return (callback: (trx: Base) => Promise<unknown>) =>
          target.transaction((trx) => callback(withHashedSessionTokens(trx as Base)));
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
