import { boolean, index, pgEnum, pgTable, smallint, text, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

// Справочники структуры вуза и профили (SPEC §6.1, §10.4). Данные только вымышленные.

export const programLevelEnum = pgEnum("program_level", [
  "bachelor",
  "master",
  "specialist",
  "postgraduate",
]);
export const studyFormEnum = pgEnum("study_form", ["full_time", "part_time", "evening"]);
export const studentStatusEnum = pgEnum("student_status", ["studying", "academic_leave"]);

export const faculties = pgTable("faculties", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
});

export const programs = pgTable(
  "programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    facultyId: uuid("faculty_id")
      .notNull()
      .references(() => faculties.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    level: programLevelEnum("level").notNull(),
  },
  (t) => [index("programs_faculty_id_idx").on(t.facultyId)],
);

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id),
    /** «Б-ЭК-101» */
    title: text("title").notNull().unique(),
    course: smallint("course").notNull(),
    /** Демо-группа песочницы жюри (SPEC §6.1 п.11). */
    isSandbox: boolean("is_sandbox").notNull().default(false),
  },
  (t) => [index("groups_program_id_idx").on(t.programId)],
);

/**
 * Подразделения: деканаты и студенческий офис.
 * faculty_id = null — общевузовское подразделение (студенческий офис обслуживает все факультеты).
 */
export const units = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    facultyId: uuid("faculty_id").references(() => faculties.id),
    title: text("title").notNull(),
    /** «Каб. 112, корпус А» */
    place: text("place").notNull(),
    /** «Пн–пт 10:00–17:00» */
    hours: text("hours").notNull(),
  },
  (t) => [index("units_faculty_id_idx").on(t.facultyId)],
);

/** Профиль студента. user_id — он же studentId во всех личных таблицах (student_id). */
export const studentProfiles = pgTable(
  "student_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    lastName: text("last_name").notNull(),
    firstName: text("first_name").notNull(),
    middleName: text("middle_name"),
    displayName: text("display_name").notNull(),
    facultyId: uuid("faculty_id")
      .notNull()
      .references(() => faculties.id),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id),
    course: smallint("course").notNull(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    studyForm: studyFormEnum("study_form").notNull(),
    /** «DEMO-…» */
    studentCardNo: text("student_card_no").notNull().unique(),
    admissionYear: smallint("admission_year").notNull(),
    status: studentStatusEnum("status").notNull().default("studying"),
    onboardingDone: boolean("onboarding_done").notNull().default(false),
  },
  (t) => [
    index("student_profiles_group_id_idx").on(t.groupId),
    index("student_profiles_faculty_id_idx").on(t.facultyId),
  ],
);

/** Профиль сотрудника. Факультет сотрудника — через подразделение (units.faculty_id). */
export const staffProfiles = pgTable(
  "staff_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    lastName: text("last_name").notNull(),
    firstName: text("first_name").notNull(),
    middleName: text("middle_name"),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id),
    position: text("position").notNull(),
  },
  (t) => [index("staff_profiles_unit_id_idx").on(t.unitId)],
);
