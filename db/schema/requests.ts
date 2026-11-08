import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { Delivery, FormFieldSchema } from "../../src/contracts/api";
import { users } from "./auth";
import { studentProfiles } from "./people";

// Заявки, справки и документы (SPEC §6.5, §10.4). Личные таблицы под RLS (0001_rls.sql).
// request_events — только дописывается: UPDATE/DELETE роли приложения запрещены.

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const requestStatusEnum = pgEnum("request_status", [
  "submitted",
  "in_progress",
  "needs_info",
  "ready",
  "issued",
  "rejected",
  "cancelled",
]);
export const deliveryEnum = pgEnum("delivery", ["electronic", "original"]);
export const rejectReasonEnum = pgEnum("reject_reason", [
  "INCOMPLETE",
  "NOT_ELIGIBLE",
  "DUPLICATE",
  "OTHER",
]);

/** Порядковая часть номера «СП-ГГММ-NNNN». */
export const requestNumberSeq = pgSequence("request_number_seq", { startWith: 1 });

export const requestTypes = pgTable("request_types", {
  code: text("code").primaryKey(),
  title: text("title").notNull(),
  hint: text("hint").notNull(),
  synonyms: text("synonyms")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  slaDays: smallint("sla_days").notNull(),
  deliveryOptions: text("delivery_options").array().$type<Delivery[]>().notNull(),
  formSchema: jsonb("form_schema").$type<FormFieldSchema[]>().notNull().default([]),
  popular: boolean("popular").notNull().default(false),
  sortOrder: smallint("sort_order").notNull().default(0),
});

export const requests = pgTable(
  "requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull().unique(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => studentProfiles.userId, { onDelete: "cascade" }),
    typeCode: text("type_code")
      .notNull()
      .references(() => requestTypes.code),
    status: requestStatusEnum("status").notNull(),
    /** Поля формы по formSchema типа (payload_json в SPEC). */
    payload: jsonb("payload").$type<Record<string, string | number>>().notNull().default({}),
    /** null — заявление: документ не выдаётся (типы без delivery_options). */
    delivery: deliveryEnum("delivery"),
    copies: smallint("copies").notNull().default(1),
    createdAt: ts("created_at").notNull(),
    dueAt: ts("due_at").notNull(),
    /** Время последнего события (смена статуса, сообщение сотрудника). */
    updatedAt: ts("updated_at").notNull(),
    /** Когда студент последний раз открывал карточку; unseen = updated_at > student_seen_at. */
    studentSeenAt: ts("student_seen_at"),
    assigneeId: uuid("assignee_id").references(() => users.id),
    rejectReason: rejectReasonEnum("reject_reason"),
    resubmittedFrom: uuid("resubmitted_from").references((): AnyPgColumn => requests.id),
  },
  (t) => [
    index("requests_student_status_idx").on(t.studentId, t.status),
    index("requests_status_due_idx").on(t.status, t.dueAt),
    index("requests_student_created_idx").on(t.studentId, t.createdAt),
  ],
);

export const requestEvents = pgTable(
  "request_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    /** null — создание заявки. */
    fromStatus: requestStatusEnum("from_status"),
    toStatus: requestStatusEnum("to_status").notNull(),
    /** null — система (напоминание о сроке и т.п.). */
    actorId: uuid("actor_id").references(() => users.id),
    comment: text("comment"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("request_events_request_idx").on(t.requestId, t.createdAt)],
);

export const requestMessages = pgTable(
  "request_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("request_messages_request_idx").on(t.requestId, t.createdAt)],
);

/**
 * Выданные документы. Код проверки (/verify/[code]) — 128 бит; в БД только его SHA-256.
 * Код выводится как HMAC(секрет, id документа), поэтому ссылку можно показать повторно, не храня код.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => studentProfiles.userId, { onDelete: "cascade" }),
    /** Ключ файла в хранилище вне public/. */
    fileKey: text("file_key").notNull(),
    verifyTokenHash: text("verify_token_hash").notNull().unique(),
    issuedAt: ts("issued_at").notNull(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [
    index("documents_student_id_idx").on(t.studentId),
    index("documents_request_id_idx").on(t.requestId),
  ],
);
