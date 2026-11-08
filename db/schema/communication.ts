import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnnouncementAudience } from "../../src/contracts/api";
import { users } from "./auth";
import { studentProfiles, units } from "./people";
import { assessments, courses } from "./study";

// Объявления, уведомления, дедлайны и планы, обращения, справочник (SPEC §6.6–6.8, §10.4).

const ts = (name: string) => timestamp(name, { withTimezone: true });
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const notificationClassEnum = pgEnum("notification_class", ["urgent", "personal", "info"]);
export const notificationCategoryEnum = pgEnum("notification_category", [
  "schedule",
  "request",
  "grade",
  "deadline",
  "announcement",
  "ticket",
  "plan",
]);
export const notificationLinkKindEnum = pgEnum("notification_link_kind", [
  "class",
  "request",
  "course",
  "deadline",
  "announcement",
  "ticket",
]);
export const notificationPresetEnum = pgEnum("notification_preset", [
  "default",
  "evening",
  "custom",
]);
export const deadlineSourceEnum = pgEnum("deadline_source", ["assessment", "admin", "personal"]);
export const ticketTopicEnum = pgEnum("ticket_topic", [
  "schedule",
  "grades",
  "requests",
  "dorm",
  "scholarship",
  "other",
]);
export const ticketStatusEnum = pgEnum("ticket_status", ["open", "answered", "closed"]);
export const ticketLinkKindEnum = pgEnum("ticket_link_kind", ["class", "request", "course"]);

export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorUnitId: uuid("author_unit_id")
      .notNull()
      .references(() => units.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    /** Markdown. В HTML — только через санитайзер (SPEC §9.4). */
    bodyMd: text("body_md").notNull(),
    audience: jsonb("audience").$type<AnnouncementAudience>().notNull(),
    important: boolean("important").notNull().default(false),
    publishAt: ts("publish_at").notNull(),
    expiresAt: ts("expires_at"),
    archivedAt: ts("archived_at"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("announcements_publish_at_idx").on(t.publishAt)],
);

/** Уведомления пользователю. Отдаются только при deliver_at ≤ now() (слоты дайджеста, DS-02). */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    class: notificationClassEnum("class").notNull(),
    category: notificationCategoryEnum("category").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    linkKind: notificationLinkKindEnum("link_kind").notNull(),
    linkId: uuid("link_id").notNull(),
    createdAt: ts("created_at").notNull(),
    /** Момент показа: сразу или ближайший слот дайджеста. */
    deliverAt: ts("deliver_at").notNull(),
    readAt: ts("read_at"),
  },
  (t) => [
    index("notifications_user_read_idx").on(t.userId, t.readAt),
    index("notifications_user_deliver_idx").on(t.userId, t.deliverAt),
    index("notifications_debounce_idx").on(t.userId, t.category, t.linkId),
  ],
);

export const notificationPrefs = pgTable("notification_prefs", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  preset: notificationPresetEnum("preset").notNull().default("default"),
  /** Минуты от полуночи МСК, по возрастанию: 8:00 / 13:00 / 19:00. */
  slots: smallint("slots")
    .array()
    .notNull()
    .default(sql`'{480,780,1140}'::smallint[]`),
  quietFrom: smallint("quiet_from").notNull().default(1380),
  quietTo: smallint("quiet_to").notNull().default(420),
  immediateCategories: text("immediate_categories")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  disabledCategories: text("disabled_categories")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/**
 * Дедлайны студента. Для source = assessment/admin строки создаются на каждого студента
 * (сидом или сервисом), чтобы звёздочка и «Сделано» были личными.
 */
export const deadlines = pgTable(
  "deadlines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => studentProfiles.userId, { onDelete: "cascade" }),
    source: deadlineSourceEnum("source").notNull(),
    assessmentId: uuid("assessment_id").references(() => assessments.id),
    courseId: uuid("course_id").references(() => courses.id),
    title: text("title").notNull(),
    dueAt: ts("due_at").notNull(),
    starred: boolean("starred").notNull().default(false),
    doneAt: ts("done_at"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("deadlines_student_due_idx").on(t.studentId, t.dueAt)],
);

/** План «если–то» к дедлайну (SPEC §6.7 п.6). */
export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => studentProfiles.userId, { onDelete: "cascade" }),
    deadlineId: uuid("deadline_id")
      .notNull()
      .references(() => deadlines.id, { onDelete: "cascade" }),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    place: text("place").notNull(),
    firstAction: text("first_action").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [
    index("plans_student_id_idx").on(t.studentId),
    index("plans_deadline_id_idx").on(t.deadlineId),
  ],
);

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => studentProfiles.userId, { onDelete: "cascade" }),
    topic: ticketTopicEnum("topic").notNull(),
    status: ticketStatusEnum("status").notNull().default("open"),
    linkKind: ticketLinkKindEnum("link_kind"),
    linkId: uuid("link_id"),
    createdAt: ts("created_at").notNull(),
    lastMessageAt: ts("last_message_at").notNull(),
    /** unread = last_message_at > student_seen_at и последнее сообщение от сотрудника. */
    studentSeenAt: ts("student_seen_at"),
  },
  (t) => [
    index("tickets_student_id_idx").on(t.studentId),
    index("tickets_status_idx").on(t.status),
  ],
);

export const ticketMessages = pgTable(
  "ticket_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("ticket_messages_ticket_idx").on(t.ticketId, t.createdAt)],
);

/** Справочник студента (SPEC §11.4). tsv — русская морфология для поиска и помощника. */
export const kbArticles = pgTable(
  "kb_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull(),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    updatedAt: ts("updated_at").notNull(),
    tsv: tsvector("tsv").generatedAlwaysAs(
      sql`setweight(to_tsvector('russian', coalesce(title, '')), 'A') || setweight(to_tsvector('russian', coalesce(body_md, '')), 'B')`,
    ),
  },
  (t) => [index("kb_articles_tsv_idx").using("gin", t.tsv)],
);
