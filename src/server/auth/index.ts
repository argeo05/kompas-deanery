import "server-only";
import { createHmac } from "node:crypto";
import { betterAuth } from "better-auth";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { admin, username } from "better-auth/plugins";
import { accounts, rateLimits, sessions, users, verifications } from "../../../db/schema";
import { getDb } from "../db";
import { assertTrustedProxy, ipHeaderName } from "./client-ip";
import { hashPassword, verifyPassword } from "./password";
import { withHashedSessionTokens } from "./session-token-hash";

// Better Auth (SPEC §6.1 п.9, §9.2, D-002 в docs/DECISIONS.md).
// Вход только по логину (плагин username), регистрации нет (disableSignUp): аккаунты создаёт сид или сервер.
// Сессии — в БД, срок 30 дней со скользящим продлением; «выйти везде» = удалить строки sessions.

type HookCtx = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

const isProduction = process.env.NODE_ENV === "production";

/**
 * Cookie сессии в production: префикс `__Host-` (Secure, Path=/, без Domain), SPEC §9.2.
 * Встроенный префикс `__Secure-` отключён (useSecureCookies: false), имя задаём сами.
 */
const hostCookie = (name: string) => ({
  name: `${isProduction ? "__Host-" : ""}kompas.${name}`,
  attributes: { secure: isProduction },
});

const DAY = 60 * 60 * 24;

/**
 * Маршруты Better Auth, которые прототипу не нужны и опасны (аудит A2, D-002):
 * вход по e-mail (SPEC §6.1 «Тонкости») и обход лимита на /sign-in/username, перебор логинов,
 * смена логина/имени/e-mail мимо наших эндпоинтов, сброс пароля по почте (почты нет).
 */
const DISABLED_PATHS = [
  "/sign-in/email",
  "/is-username-available",
  "/update-user",
  "/change-email",
  "/request-password-reset",
  "/reset-password",
];

/** Демо-аккаунтам смену пароля не даём: иначе один эксперт закроет вход остальным (SPEC §6.1 «Тонкости»). */
const lockDemoPassword = async (ctx: HookCtx) => {
  if (ctx.path !== "/change-password") return;
  const session = await getSessionFromCtx(ctx);
  if ((session?.user as { isDemo?: boolean } | undefined)?.isDemo) {
    throw new APIError("FORBIDDEN", {
      code: "DEMO_PASSWORD_LOCKED",
      message: "DEMO_PASSWORD_LOCKED",
    });
  }
};

/**
 * Лимит входа по логину (SPEC §9.7), отдельно от лимита по IP (customRules ниже, 5 за 30 с):
 * 20 НЕУДАЧНЫХ попыток в час на логин. Считаем только неудачи, иначе эксперты жюри, входящие
 * под одним демо-аккаунтом, блокировали бы друг друга. Счётчик в памяти процесса (контейнер один).
 */
const usernameFailures = new RateLimiterMemory({ points: 20, duration: 3600 });
const loginKey = (ctx: { body?: unknown }) => {
  const value = (ctx.body as { username?: unknown } | undefined)?.username;
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 64) : null;
};

const limitLoginByUsername = async (ctx: HookCtx) => {
  if (ctx.path !== "/sign-in/username") return;
  const key = loginKey(ctx);
  const state = key ? await usernameFailures.get(key) : null;
  if (state && state.remainingPoints <= 0) {
    throw new APIError("TOO_MANY_REQUESTS", {
      code: "RATE_LIMITED",
      message: "RATE_LIMITED",
    });
  }
};

const countLoginFailure = async (ctx: HookCtx) => {
  if (ctx.path !== "/sign-in/username") return;
  const key = loginKey(ctx);
  if (key && ctx.context.returned instanceof APIError) {
    await usernameFailures.consume(key).catch(() => undefined);
  }
};

/** IP в sessions храним как HMAC — для отладки сессий хватает, а утечка БД не раскрывает адреса. */
function hashIp(ip: string): string {
  return createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "")
    .update(ip)
    .digest("hex")
    .slice(0, 32);
}

function createAuth() {
  assertTrustedProxy();
  return betterAuth({
    appName: "Компас",
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : [],
    disabledPaths: DISABLED_PATHS,
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        await lockDemoPassword(ctx);
        await limitLoginByUsername(ctx);
      }),
      after: createAuthMiddleware(countLoginFailure),
    },
    // Токен сессии в БД хранится хешем (session-token-hash.ts).
    database: (options: Parameters<ReturnType<typeof drizzleAdapter>>[0]) =>
      withHashedSessionTokens(
        drizzleAdapter(getDb(), {
          provider: "pg",
          schema: {
            user: users,
            session: sessions,
            account: accounts,
            verification: verifications,
            rateLimit: rateLimits,
          },
        })(options),
      ),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    user: {
      additionalFields: {
        isDemo: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },
    session: {
      expiresIn: 30 * DAY,
      updateAge: DAY,
      // Без кэша сессии в cookie: отзыв («выйти везде», бан) действует сразу.
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 100,
      // Защита от перебора. Счётчик «5 неудачных на логин+IP за 15 минут → пауза 30 с» (SPEC §6.1 п.3)
      // требует знать логин; его делает сессия экрана входа (TODO A3 в docs/DECISIONS.md, D-002).
      customRules: { "/sign-in/username": { window: 30, max: 5 } },
    },
    advanced: {
      cookiePrefix: "kompas",
      useSecureCookies: false,
      cookies: {
        session_token: hostCookie("session_token"),
        session_data: hostCookie("session_data"),
        dont_remember: hostCookie("dont_remember"),
      },
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      database: { generateId: "uuid" },
      ipAddress: { ipAddressHeaders: [ipHeaderName()] },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => ({
            data: { ...session, ipAddress: session.ipAddress ? hashIp(session.ipAddress) : null },
          }),
        },
      },
    },
    plugins: [
      username({
        // Логин — идентификатор демо-аккаунта для всех экспертов; менять его нельзя.
        immutableUsername: true,
        minUsernameLength: 3,
        maxUsernameLength: 40,
        // «Ivanova.A » входит как «ivanova.a» (AC-1.9): сначала нормализация, потом проверка.
        usernameNormalization: (value) => value.trim().toLowerCase(),
        usernameValidator: (value) => /^[a-z0-9._-]+$/.test(value),
        validationOrder: { username: "post-normalization" },
      }),
      admin({ defaultRole: "student", adminRoles: ["admin"] }),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | undefined;

/** Экземпляр создаётся лениво: при `next build` нет DATABASE_URL. */
export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}

export type AuthSession = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
