import { createHash, randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { faker } from "@faker-js/faker/locale/ru";
import * as schema from "../schema";
import { formatRequestNumber } from "../../src/lib/request-number";
import { hashPassword } from "../../src/server/auth/password";
import { addWorkdays } from "../../src/lib/workdays";
import { mskParts, toMsk } from "../../src/lib/time";
import type { SeedDates } from "./dates";
import type { SeedDb } from "./demo-accounts";
import { REQUEST_TYPES } from "./request-types";

// DS-40. Фоновая популяция (SPEC §11.3, уточнение D-003). Дополняет demo-accounts.ts до объёмов:
//   6 программ (3), 8 групп (6), 34 фоновых студента, 25 преподавателей (20),
//   30 аудиторий в 4 корпусах (25), 18 дисциплин (13), расписание семестра, 200+ оценок,
//   60 заявок, 30 объявлений.
// Ограничения (D-003): для групп Б-ЭК-101 и М-ЦМ-11 НЕ создаём пары, оценки и экзамены;
//   заявки популяции — только в статусах needs_info, ready, issued, rejected, cancelled.
// Детерминизм: faker.seed(2026); все даты через SeedDates; e-mail только @example.edu.

const BG_STUDENTS = 34;
const NEW_TEACHERS = 20;
const NEW_ROOMS = 25;
const REQUESTS_COUNT = 60;
const ANNOUNCEMENTS_COUNT = 30;

const SLOTS: ReadonlyArray<readonly [string, string]> = [
  ["09:30", "10:50"],
  ["11:10", "12:30"],
  ["12:40", "14:00"],
  ["15:20", "16:40"],
  ["17:10", "18:30"],
  ["19:00", "20:20"],
];

const CLASS_TYPES = ["lecture", "seminar", "practice"] as const;
const STUDY_FORMS = ["full_time", "part_time", "evening"] as const;
const BUILDINGS = ["А", "Б", "В", "Г"] as const;

const MALE_MID = [
  "Андреевич",
  "Романович",
  "Олегович",
  "Сергеевич",
  "Игоревич",
  "Викторович",
  "Александрович",
  "Михайлович",
] as const;
const FEMALE_MID = [
  "Андреевна",
  "Романовна",
  "Олеговна",
  "Сергеевна",
  "Игоревна",
  "Викторовна",
  "Александровна",
  "Михайловна",
] as const;

const NEW_PROGRAMS = [
  { code: "38.04.01", title: "Финансовая аналитика", level: "master" as const },
  { code: "42.03.02", title: "Медиапродакшн", level: "bachelor" as const },
  { code: "41.04.02", title: "Мировая политика", level: "master" as const },
] as const;

const GROUP_PLAN = [
  { programIdx: 0, title: "Б-ЭК-102", course: 1, isSandbox: false },
  { programIdx: 0, title: "Б-ЭК-103", course: 1, isSandbox: false },
  { programIdx: 1, title: "Б-ЦМ-101", course: 1, isSandbox: false },
  { programIdx: 1, title: "Б-ЦМ-102", course: 1, isSandbox: false },
  { programIdx: 2, title: "Б-МН-101", course: 1, isSandbox: false },
  { programIdx: 2, title: "М-МН-111", course: 2, isSandbox: true },
] as const;

const NEW_COURSE_POOL: Array<{
  title: string;
  shortTitle: string;
  control: "exam" | "credit" | "graded_credit";
}> = [
  { title: "Политология", shortTitle: "Полит.", control: "exam" },
  { title: "История международных отношений", shortTitle: "ИМО", control: "credit" },
  { title: "Высшая математика", shortTitle: "Матем.", control: "exam" },
  { title: "Социология", shortTitle: "Социол.", control: "graded_credit" },
  { title: "Право", shortTitle: "Право", control: "exam" },
  { title: "Компаративистика", shortTitle: "Компар.", control: "graded_credit" },
  { title: "Дипломатический протокол", shortTitle: "Протокол", control: "credit" },
  { title: "Базы данных", shortTitle: "БД", control: "exam" },
  { title: "Медиаграмотность", shortTitle: "Медиа", control: "graded_credit" },
  { title: "Статистика", shortTitle: "Стат.", control: "exam" },
  { title: "Теория коммуникаций", shortTitle: "Т. ком.", control: "credit" },
  { title: "Интеллектуальные системы", shortTitle: "И. сист.", control: "exam" },
  { title: "Проектная аналитика", shortTitle: "Проект", control: "graded_credit" },
];

const REQUEST_STATUS_PLAN: Array<"needs_info" | "ready" | "issued" | "rejected" | "cancelled"> = [
  ...Array<"needs_info">(12).fill("needs_info"),
  ...Array<"ready">(12).fill("ready"),
  ...Array<"issued">(15).fill("issued"),
  ...Array<"rejected">(10).fill("rejected"),
  ...Array<"cancelled">(11).fill("cancelled"),
];

const REJECT_REASONS = ["INCOMPLETE", "NOT_ELIGIBLE", "DUPLICATE", "OTHER"] as const;
const DAY_TIMES = ["10:15", "12:40", "09:45", "16:20", "14:05"] as const;

const ANNOUNCEMENT_TITLES = [
  "Перенос пары первой подгруппы",
  "Дедлайн выбора курсов по выбору",
  "Сроки выплат стипендии",
  "Собрание академической группы",
  "Перерыв в работе Wi-Fi в корпусе",
  "Новое время консультаций",
  "Запись на элективы открыта",
  "Технический перерыв в библиотеке",
  "Расписание коллоквиумов",
  "Продление часов деканата",
] as const;

const pick = <T>(arr: readonly T[], i: number): T => arr[i % arr.length]!;
const pad3 = (n: number) => String(n).padStart(3, "0");

/** Сколько пар в учебный день группы (детерминированно от индексов). */
const lessonsOfDay = (groupIdx: number, weekday: number) =>
  weekday === 6 ? 1 : 1 + ((groupIdx + weekday) % 4);

/** День недели ISO (1 — пн … 7 — вс) московского дня со сдвигом offset. */
const weekdayOf = (d: SeedDates, offset: number) => mskParts(d.at(offset, "12:00")).weekday;

export async function seedPopulation(db: SeedDb, d: SeedDates) {
  faker.seed(2026);
  const created = d.at(-60, "09:00");

  // ── 1. Структура: +3 программы и +6 групп (demo создал 3 факультета, 3 программы, 2 группы).
  const faculties = await db.select().from(schema.faculties).orderBy(asc(schema.faculties.code));
  const programs = await db
    .insert(schema.programs)
    .values(
      NEW_PROGRAMS.map((p, i) => ({
        facultyId: faculties[i]!.id,
        code: p.code,
        title: p.title,
        level: p.level,
      })),
    )
    .returning();
  const facultyOfProgram = new Map(programs.map((p) => [p.id, p.facultyId]));
  const groups = await db
    .insert(schema.groups)
    .values(
      GROUP_PLAN.map((g) => ({
        programId: programs[g.programIdx]!.id,
        title: g.title,
        course: g.course,
        isSandbox: g.isSandbox,
      })),
    )
    .returning();

  // ── 2. Преподаватели: +20 (всего 25).
  const existingTeachers = await db.select().from(schema.teachers);
  const newTeachers = await db
    .insert(schema.teachers)
    .values(
      Array.from({ length: NEW_TEACHERS }, (_, i) => {
        const isMale = i % 2 === 1;
        const sex: "female" | "male" = isMale ? "male" : "female";
        const last = faker.person.lastName(sex);
        const first = faker.person.firstName(sex);
        const mid = isMale ? MALE_MID[i % 8] : FEMALE_MID[i % 8];
        return {
          fullName: `${last} ${first} ${mid}`,
          email: `pop.t${pad3(i + 1)}@example.edu`,
          officeHours: i % 3 === 0 ? "Ср 15:00–16:30, ауд. 214" : null,
        };
      }),
    )
    .returning();
  const allTeachers = [...existingTeachers, ...newTeachers];

  // ── 3. Аудитории: +25 (всего 30) в корпусах А, Б, В, Г.
  const existingRooms = await db.select().from(schema.rooms);
  const roomKeys = new Set(existingRooms.map((r) => `${r.building}!${r.number}`));
  const roomValues: Array<typeof schema.rooms.$inferInsert> = [];
  for (let floor = 2; floor <= 6 && roomValues.length < NEW_ROOMS; floor++) {
    for (let idx = 0; idx < 30 && roomValues.length < NEW_ROOMS; idx++) {
      const building = BUILDINGS[idx % 4]!;
      const number = `${floor}${pad3(105 + idx * 3)}`;
      const key = `${building}!${number}`;
      if (roomKeys.has(key)) continue;
      roomKeys.add(key);
      roomValues.push({ building, number, floor, hint: null });
    }
  }
  const newRooms = await db.insert(schema.rooms).values(roomValues).returning();
  const allRooms = [...existingRooms, ...newRooms];

  // ── 4. Дисциплины: +13 (всего 18), семестр 2026-1.
  const courses = await db
    .insert(schema.courses)
    .values(
      NEW_COURSE_POOL.map((c, i) => ({
        title: c.title,
        shortTitle: c.shortTitle,
        colorIndex: i % 10,
        control: c.control,
        semester: "2026-1",
        rulesText: "Условные правила оценивания для демо-данных.",
        leadTeacherId: pick(allTeachers, i).id,
        passThreshold: c.control === "credit" ? 50 : null,
      })),
    )
    .returning();

  // Каждой новой группе — 4 дисциплины из пула по детерминированному правилу.
  const courseIdsOfGroup = new Map<string, string[]>();
  groups.forEach((gr, gi) => {
    const ids: string[] = [];
    for (let k = 0; k < 4; k++) ids.push(courses[(gi + k * 6) % courses.length]!.id);
    courseIdsOfGroup.set(gr.id, ids);
  });

  // ── 5. Фоновые студенты: 34 пользователя + аккаунты + профили в новых группах.
  const bgRows = Array.from({ length: BG_STUDENTS }, (_, i) => {
    const isMale = i % 2 === 1;
    const sex: "female" | "male" = isMale ? "male" : "female";
    const last = faker.person.lastName(sex);
    const first = faker.person.firstName(sex);
    return {
      id: randomUUID(),
      username: `bg.st.${pad3(i + 1)}`,
      displayUsername: `bg.st.${pad3(i + 1)}`,
      name: `${last} ${first}`,
      email: `bg.st.${pad3(i + 1)}@example.edu`,
      last,
      first,
      mid: isMale ? MALE_MID[(i * 3) % 8] : FEMALE_MID[(i * 3) % 8],
      groupId: groups[i % groups.length]!.id,
    };
  });

  await db.insert(schema.users).values(
    bgRows.map((u) => ({
      id: u.id,
      username: u.username,
      displayUsername: u.displayUsername,
      name: u.name,
      email: u.email,
      emailVerified: true,
      role: "student" as const,
      isDemo: false,
      createdAt: created,
      updatedAt: created,
    })),
  );

  const passwordHash = await hashPassword("kompas-background-demo");
  await db.insert(schema.accounts).values(
    bgRows.map((u) => ({
      accountId: u.id,
      providerId: "credential",
      userId: u.id,
      password: passwordHash,
      createdAt: created,
      updatedAt: created,
    })),
  );

  const groupById = new Map(groups.map((g) => [g.id, g]));
  await db.insert(schema.studentProfiles).values(
    bgRows.map((u, i) => {
      const group = groupById.get(u.groupId)!;
      const facultyId = facultyOfProgram.get(group.programId) ?? faculties[0]!.id;
      return {
        userId: u.id,
        lastName: u.last,
        firstName: u.first,
        middleName: u.mid,
        displayName: u.first,
        facultyId,
        programId: group.programId,
        course: group.course,
        groupId: u.groupId,
        studyForm: pick(STUDY_FORMS, i),
        studentCardNo: `DEMO-26${pad3(300 + i)}`,
        admissionYear: 2026,
        status: i === 5 ? ("academic_leave" as const) : ("studying" as const),
        onboardingDone: true,
      };
    }),
  );

  // ── 6. Записи на дисциплины: у каждого фонового студента — дисциплины его группы.
  const enrollmentValues: Array<typeof schema.enrollments.$inferInsert> = [];
  for (const u of bgRows) {
    for (const courseId of courseIdsOfGroup.get(u.groupId)!) {
      enrollmentValues.push({ studentId: u.id, courseId });
    }
  }
  await db.insert(schema.enrollments).values(enrollmentValues);

  // ── 7. Расписание семестра: пары только новых групп за ±14 дней.
  const classValues: Array<typeof schema.classes.$inferInsert> = [];
  groups.forEach((gr, gi) => {
    const courseIds = courseIdsOfGroup.get(gr.id)!;
    for (let offset = -14; offset <= 14; offset++) {
      const weekday = weekdayOf(d, offset);
      if (weekday === 7) continue;
      for (let j = 0; j < lessonsOfDay(gi, weekday); j++) {
        const [start, end] = SLOTS[(gi + weekday + j) % SLOTS.length]!;
        classValues.push({
          courseId: courseIds[(gi + weekday + j) % courseIds.length]!,
          groupId: gr.id,
          type: pick(CLASS_TYPES, weekday + j),
          startsAt: d.at(offset, start),
          endsAt: d.at(offset, end),
          roomId: pick(allRooms, gi + weekday + j).id,
          teacherId: pick(allTeachers, gi * 2 + weekday + j).id,
        });
      }
    }
  });
  await db.insert(schema.classes).values(classValues);

  // ── 8. Элементы контроля: по 3 на дисциплину (контрольная и эссе позади, финал в сессии).
  const assessmentRows = await db
    .insert(schema.assessments)
    .values(
      courses.flatMap((c, ci) => [
        {
          courseId: c.id,
          title: "Контрольная работа",
          type: "test",
          maxScore: 10,
          weight: 0.3,
          dueAt: d.at(-(ci % 5) - 22, pick(DAY_TIMES, ci)),
        },
        {
          courseId: c.id,
          title: "Эссе",
          type: "essay",
          maxScore: 20,
          weight: 0.3,
          dueAt: d.at(-(ci % 7) - 10, "23:59"),
        },
        {
          courseId: c.id,
          title: c.control === "credit" ? "Зачётное задание" : "Экзамен",
          type: "final",
          maxScore: 100,
          weight: 0.4,
          dueAt: null,
        },
      ]),
    )
    .returning();

  // ── 9. Оценки: 34 студента × 4 дисциплины × 2 сданных элемента = 272 (> 200). Ещё 1 «не сдано».
  const gradeValues: Array<typeof schema.grades.$inferInsert> = [];
  for (const u of bgRows) {
    for (const courseId of courseIdsOfGroup.get(u.groupId)!) {
      for (const a of assessmentRows.filter((x) => x.courseId === courseId && x.dueAt !== null)) {
        const score = Math.max(
          1,
          Math.round((Number(a.maxScore) * (50 + (u.id.length % 50))) / 100),
        );
        gradeValues.push({
          assessmentId: a.id,
          studentId: u.id,
          score,
          gradedAt: d.at(-(u.id.length % 12) - 2, "18:00"),
          gradedBy: pick(allTeachers, u.id.length + courseId.length).id,
        });
      }
    }
  }
  const grades = await db.insert(schema.grades).values(gradeValues).returning();

  // История изменений оценок (SPEC §6.4 п.3).
  const teacherNames = allTeachers.map((t) => t.fullName);
  await db.insert(schema.gradeHistory).values(
    grades.slice(0, 20).map((g, i) => {
      const score = Number(g.score ?? 0);
      return {
        gradeId: g.id,
        oldScore: Math.max(0, score - 1),
        newScore: score,
        changedAt: d.at(-(i % 10) - 1, "18:00"),
        changedBy: pick(teacherNames, i),
      };
    }),
  );

  // ── 10. Экзамены сессии + допуски (у одного фонового на группу — недопуск, SPEC §6.4 п.5).
  const examValues: Array<typeof schema.exams.$inferInsert> = [];
  groups.forEach((gr, gi) => {
    for (const courseId of courseIdsOfGroup.get(gr.id)!) {
      const course = courses.find((c) => c.id === courseId)!;
      examValues.push({
        courseId,
        groupId: gr.id,
        type: course.control,
        startsAt: d.at(24 + (gi % 10), pick(DAY_TIMES, gi)),
        roomId: pick(allRooms, gi + 2).id,
        consultationAt: d.at(22 + (gi % 10), "15:20"),
      });
    }
  });
  const exams = await db.insert(schema.exams).values(examValues).returning();
  const admissionsValues: Array<typeof schema.admissions.$inferInsert> = [];
  for (const u of bgRows) {
    const groupExams = exams.filter((x) => x.groupId === u.groupId);
    const firstExamId = groupExams[0]?.id;
    for (const e of groupExams) {
      // Демо-сценарий недопуска: у каждого пятого фонового студента долги по первому экзамену.
      const denied = e.id === firstExamId && Number(u.username.slice(-2)) % 5 === 1;
      admissionsValues.push({
        studentId: u.id,
        examId: e.id,
        admitted: !denied,
        reason: denied ? "Задолженность по элементам контроля (пример)" : null,
      });
    }
  }
  await db.insert(schema.admissions).values(admissionsValues);

  // ── 11. Заявки: 60 шт. в статусах вне submitted/in_progress (очередь Елены не трогаем).
  const [staffUser] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, "elena.staff"));
  const [officeUnit] = await db
    .select()
    .from(schema.units)
    .where(eq(schema.units.title, "Студенческий офис"))
    .limit(1);
  const seqRows = await db.execute<{ seq: string }>(
    sql`SELECT nextval('request_number_seq') AS seq FROM generate_series(1, ${REQUESTS_COUNT})`,
  );
  const seqOf = (i: number) => Number(seqRows[i]?.seq ?? i + 1);

  const requestInserts: Array<typeof schema.requests.$inferInsert> = [];
  for (let i = 0; i < REQUESTS_COUNT; i++) {
    const status = REQUEST_STATUS_PLAN[i]!;
    const type = REQUEST_TYPES[i % REQUEST_TYPES.length]!;
    const createdOffset = -(i % 24) - 1;
    const createdAt = d.at(createdOffset, pick(DAY_TIMES, i));
    const dueAt = new Date(addWorkdays(toMsk(createdAt), type.slaDays));
    const field = type.formSchema.find((f) => f.required) ?? type.formSchema[0];
    const payload: Record<string, string | number> = {};
    if (field) {
      payload[field.name] =
        field.kind === "select" ? (field.options?.[0] ?? "") : "Пример заполнения (демо-данные)";
    }
    const delivery = type.deliveryOptions[0] ?? null;
    let updatedAt = createdAt;
    if (status === "issued") updatedAt = d.at(createdOffset + 2, "15:00");
    else if (status !== "cancelled") updatedAt = d.at(createdOffset + 1, "11:30");
    requestInserts.push({
      number: formatRequestNumber(createdAt, seqOf(i)),
      studentId: bgRows[i % bgRows.length]!.id,
      typeCode: type.code,
      status,
      payload,
      delivery,
      copies: delivery ? (i % 3) + 1 : 1,
      createdAt,
      dueAt,
      updatedAt,
      studentSeenAt: createdAt,
      assigneeId: status === "cancelled" ? null : (staffUser?.id ?? null),
      rejectReason: status === "rejected" ? REJECT_REASONS[i % REJECT_REASONS.length] : null,
    });
  }
  const requestRows = await db.insert(schema.requests).values(requestInserts).returning();

  // События заявок по цепочке (DS-06): submitted → in_progress → финал; cancel — только из submitted.
  const eventValues: Array<typeof schema.requestEvents.$inferInsert> = [];
  const documentValues: Array<typeof schema.documents.$inferInsert> = [];
  requestRows.forEach((r, i) => {
    const source = requestInserts[i]!;
    const created_at = source.createdAt!;
    eventValues.push({
      requestId: r.id,
      fromStatus: null,
      toStatus: "submitted",
      actorId: r.studentId,
      createdAt: created_at,
    });
    if (r.status === "cancelled") return;
    const createdOffset = (i % 24) + 1;
    eventValues.push({
      requestId: r.id,
      fromStatus: "submitted",
      toStatus: "in_progress",
      actorId: staffUser?.id ?? null,
      createdAt: d.at(createdOffset, "09:00"),
    });
    const progressedAt = d.at(createdOffset, "11:30");
    if (r.status === "needs_info") {
      eventValues.push({
        requestId: r.id,
        fromStatus: "in_progress",
        toStatus: "needs_info",
        actorId: staffUser?.id ?? null,
        comment: "Нужно уточнить данные для оформления",
        createdAt: progressedAt,
      });
      return;
    }
    eventValues.push({
      requestId: r.id,
      fromStatus: "in_progress",
      toStatus: "ready",
      actorId: staffUser?.id ?? null,
      createdAt: progressedAt,
    });
    if (r.status === "rejected") {
      eventValues.push({
        requestId: r.id,
        fromStatus: "in_progress",
        toStatus: "rejected",
        actorId: staffUser?.id ?? null,
        comment: "Нужно исправить и подать заново",
        createdAt: progressedAt,
      });
      return;
    }
    if (r.status === "issued") {
      const issuedAt = d.at(createdOffset + 2, "15:00");
      eventValues.push({
        requestId: r.id,
        fromStatus: "ready",
        toStatus: "issued",
        actorId: staffUser?.id ?? null,
        createdAt: issuedAt,
      });
      documentValues.push({
        requestId: r.id,
        studentId: r.studentId,
        fileKey: `documents/${r.id}/document.pdf`,
        verifyTokenHash: createHash("sha256").update(`population-verify-${r.id}`).digest("hex"),
        issuedAt,
      });
    }
  });
  await db.insert(schema.requestEvents).values(eventValues);
  await db.insert(schema.documents).values(documentValues);

  // ── 12. Объявления: 30 шт. от студенческого офиса, аудитория — факультет и группа.
  const announcementValues = Array.from({ length: ANNOUNCEMENTS_COUNT }, (_, i) => {
    const publishAt = d.at(-(i % 20) - 1, "09:00");
    return {
      authorUnitId: officeUnit!.id,
      createdBy: staffUser!.id,
      title: `${pick(ANNOUNCEMENT_TITLES, i)} (${i + 1})`,
      bodyMd: `**${pick(ANNOUNCEMENT_TITLES, i)} (демо).**\n\nУсловный текст для демонстрации концепта. Детали уточняются в студенческом офисе.`,
      audience: { facultyIds: [faculties[i % 3]!.id], groupIds: [groups[i % groups.length]!.id] },
      important: i % 4 === 0,
      publishAt,
      expiresAt: d.at(30, "18:00"),
      createdAt: publishAt,
    };
  });
  await db.insert(schema.announcements).values(announcementValues);
}
