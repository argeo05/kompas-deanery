import {
  boolean,
  index,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { groups, studentProfiles } from "./people";

// Расписание и успеваемость (SPEC §6.3, §6.4, §10.4).
// Личные таблицы (student_id) защищены RLS — см. db/migrations/0001_rls.sql.

const ts = (name: string) => timestamp(name, { withTimezone: true });
/** numeric в Drizzle по умолчанию — строка; здесь сразу число (баллы ≤ 3 знаков после запятой). */
const score = (name: string) => numeric(name, { precision: 6, scale: 2, mode: "number" });

export const controlTypeEnum = pgEnum("control_type", ["exam", "credit", "graded_credit"]);
export const classTypeEnum = pgEnum("class_type", [
  "lecture",
  "seminar",
  "practice",
  "exam",
  "consultation",
]);
export const weekParityEnum = pgEnum("week_parity", ["odd", "even"]);
export const scheduleChangeTypeEnum = pgEnum("schedule_change_type", [
  "cancelled",
  "moved",
  "room_changed",
  "teacher_changed",
  "added",
]);

export const teachers = pgTable("teachers", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  /** Вымышленный адрес @example.edu. */
  email: text("email"),
  officeHours: text("office_hours"),
});

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    building: text("building").notNull(),
    number: text("number").notNull(),
    floor: smallint("floor"),
    hint: text("hint"),
  },
  (t) => [unique("rooms_building_number_uq").on(t.building, t.number)],
);

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  shortTitle: text("short_title").notNull(),
  /** 0..9 — индекс цвета из токенов. */
  colorIndex: smallint("color_index").notNull(),
  control: controlTypeEnum("control").notNull(),
  /** «2026-1» */
  semester: text("semester").notNull(),
  rulesText: text("rules_text").notNull().default(""),
  leadTeacherId: uuid("lead_teacher_id").references(() => teachers.id),
  /** Порог «зачтено» в баллах итога S (для зачёта). */
  passThreshold: score("pass_threshold"),
});

export const classes = pgTable(
  "classes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    /** null — поток или курс по выбору: студенты берутся из enrollments. */
    groupId: uuid("group_id").references(() => groups.id),
    type: classTypeEnum("type").notNull(),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id),
    weekParity: weekParityEnum("week_parity"),
  },
  (t) => [
    index("classes_group_starts_idx").on(t.groupId, t.startsAt),
    index("classes_course_id_idx").on(t.courseId),
  ],
);

export const enrollments = pgTable(
  "enrollments",
  {
    studentId: uuid("student_id")
      .notNull()
      .references(() => studentProfiles.userId, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.courseId] })],
);

export const scheduleChanges = pgTable(
  "schedule_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    type: scheduleChangeTypeEnum("type").notNull(),
    newStartsAt: ts("new_starts_at"),
    newEndsAt: ts("new_ends_at"),
    newRoomId: uuid("new_room_id").references(() => rooms.id),
    newTeacherId: uuid("new_teacher_id").references(() => teachers.id),
    reason: text("reason"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("schedule_changes_class_id_idx").on(t.classId)],
);

/** Какие изменения расписания студент уже видел (ScheduleChangeDTO.seen). */
export const scheduleChangeViews = pgTable(
  "schedule_change_views",
  {
    studentId: uuid("student_id")
      .notNull()
      .references(() => studentProfiles.userId, { onDelete: "cascade" }),
    changeId: uuid("change_id")
      .notNull()
      .references(() => scheduleChanges.id, { onDelete: "cascade" }),
    seenAt: ts("seen_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.changeId] })],
);

/** Личная заметка студента к паре (ClassDTO.note, 0–500 символов). */
export const classNotes = pgTable(
  "class_notes",
  {
    studentId: uuid("student_id")
      .notNull()
      .references(() => studentProfiles.userId, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.classId] })],
);

/** Элементы контроля дисциплины: эссе, контрольные, экзамен (SPEC §6.4). */
export const assessments = pgTable(
  "assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    title: text("title").notNull(),
    type: text("type").notNull(),
    maxScore: score("max_score").notNull(),
    weight: score("weight").notNull(),
    dueAt: ts("due_at"),
  },
  (t) => [index("assessments_course_id_idx").on(t.courseId)],
);

export const grades = pgTable(
  "grades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => studentProfiles.userId, { onDelete: "cascade" }),
    score: score("score"),
    gradedAt: ts("graded_at"),
    gradedBy: uuid("graded_by").references(() => teachers.id),
  },
  (t) => [
    unique("grades_assessment_student_uq").on(t.assessmentId, t.studentId),
    index("grades_student_id_idx").on(t.studentId),
  ],
);

export const gradeHistory = pgTable(
  "grade_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gradeId: uuid("grade_id")
      .notNull()
      .references(() => grades.id, { onDelete: "cascade" }),
    oldScore: score("old_score"),
    newScore: score("new_score").notNull(),
    changedAt: ts("changed_at").notNull().defaultNow(),
    /** ФИО преподавателя на момент изменения. */
    changedBy: text("changed_by").notNull(),
  },
  (t) => [index("grade_history_grade_id_idx").on(t.gradeId)],
);

export const finalResults = pgTable(
  "final_results",
  {
    studentId: uuid("student_id")
      .notNull()
      .references(() => studentProfiles.userId, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    semester: text("semester").notNull(),
    total: score("total").notNull(),
    mark: smallint("mark"),
    /** «passed» | «failed» | «debt» … — по SPEC §6.4. */
    status: text("status").notNull(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.courseId, t.semester] })],
);

export const exams = pgTable(
  "exams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    type: controlTypeEnum("type").notNull(),
    startsAt: ts("starts_at").notNull(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id),
    consultationAt: ts("consultation_at"),
  },
  (t) => [index("exams_group_id_idx").on(t.groupId)],
);

/** Допуск студента к экзамену/зачёту. admitted = null — ещё не решено. */
export const admissions = pgTable(
  "admissions",
  {
    studentId: uuid("student_id")
      .notNull()
      .references(() => studentProfiles.userId, { onDelete: "cascade" }),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    admitted: boolean("admitted"),
    reason: text("reason"),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.examId] })],
);
