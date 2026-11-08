import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Таблицы Better Auth (SPEC §6.1 п.9, §10.4). Имена свойств — те, что ждёт адаптер Better Auth
// (username, emailVerified…), имена колонок — наши (login, email_verified…).
// Хеш пароля лежит не в users, а в accounts.password (так устроен Better Auth): Argon2id, SPEC §9.2.

export const roleEnum = pgEnum("role", ["student", "staff", "admin"]);

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Логин для входа (`anna.demo`). Плагин username хранит его в нижнем регистре. */
    username: text("login").notNull().unique(),
    displayUsername: text("display_login"),
    /** Better Auth требует имя и e-mail. Только вымышленные, домен @example.edu (SPEC §9.8). */
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: roleEnum("role").notNull().default("student"),
    // Поля плагина admin.
    banned: boolean("banned").default(false),
    banReason: text("ban_reason"),
    banExpires: ts("ban_expires"),
    /** Демо-аккаунт: смена пароля отключена (SPEC §6.1 «Тонкости»). */
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("users_role_idx").on(t.role)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Случайный токен сессии. Cookie содержит его вместе с HMAC-подписью. */
    token: text("token").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    /** SHA-256 от IP (не сам IP) — см. databaseHooks в src/server/auth. */
    ipAddress: text("ip_hash"),
    userAgent: text("user_agent"),
    impersonatedBy: uuid("impersonated_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    /** Argon2id-хеш пароля (password_hash из SPEC §10.4). */
    password: text("password_hash"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

/** Счётчики rate limit Better Auth: в БД, а не в памяти — переживают перезапуск (SPEC §6.1 п.9). */
export const rateLimits = pgTable("rate_limits", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
