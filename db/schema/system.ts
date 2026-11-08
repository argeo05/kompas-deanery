import {
  index,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

// Служебные таблицы: аудит, аналитика, идемпотентность, токены календаря (SPEC §9, §10.4).

const ts = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Неизменяемый журнал действий (SPEC §9.1 «Repudiation», §6.9). Роли приложения разрешены только INSERT и SELECT.
 * actor_id ставится из app.user_id транзакции (src/server/audit.ts), а не из аргументов.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id"),
    at: ts("at").notNull(),
    /** Без персональных данных и сырого пользовательского ввода (SPEC §9.4). */
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("audit_log_entity_idx").on(t.entity, t.entityId)],
);

/** Обезличенная продуктовая аналитика: вместо id пользователя — его хеш. */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userIdHash: text("user_id_hash"),
    name: text("name").notNull(),
    at: ts("at").notNull(),
    props: jsonb("props").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("events_name_at_idx").on(t.name, t.at)],
);

/** Ответы на POST с заголовком Idempotency-Key (src/server/idempotency.ts). */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    /** SHA-256 от метода, пути и тела: тот же ключ с другим телом — ошибка клиента. */
    requestHash: text("request_hash").notNull(),
    /** null — запрос ещё выполняется. */
    statusCode: smallint("status_code"),
    response: jsonb("response"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

/** Токен подписки на календарь ICS (DS-22): 256 бит, в БД только SHA-256. */
export const icsTokens = pgTable("ics_tokens", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: ts("created_at").notNull(),
});
