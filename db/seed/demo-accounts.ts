import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { hashPassword } from "../../src/server/auth/password";
import { formatRequestNumber } from "../../src/lib/request-number";
import { mskParts } from "../../src/lib/time";
import { renderNotification } from "../../src/server/notify-templates";
import type { SeedDates } from "./dates";

// Демо-аккаунты для жюри и их сценарии (SPEC §11.1). Файл ведёт Claude (DEEPSEEK-TASKS §1).
// Все люди и данные вымышленные. Пароли — публичные демо-пароли: их показывает страница /jury,
// в БД попадают только Argon2id-хеши (SPEC §9.2).

export type SeedDb = PostgresJsDatabase<typeof schema>;

export const DEMO_ACCOUNTS = {
  anna: { login: "anna.demo", password: "kompas-demo-anna", role: "student" },
  maxim: { login: "maxim.demo", password: "kompas-demo-maxim", role: "student" },
  elena: { login: "elena.staff", password: "kompas-demo-elena", role: "staff" },
  /** Сотрудник деканата другого факультета — для тестов «чужой факультет → 404». Жюри не показывается. */
  oleg: { login: "oleg.staff", password: "kompas-demo-oleg", role: "staff" },
} as const;

export type DemoLogin = keyof typeof DEMO_ACCOUNTS;

// Хеширование Argon2id с 64 МиБ заметно по времени; в одном процессе (тесты) хеш переиспользуем.
const hashes = new Map<string, Promise<string>>();
const hashOnce = (password: string) => {
  if (!hashes.has(password)) hashes.set(password, hashPassword(password));
  return hashes.get(password)!;
};

async function createUser(
  db: SeedDb,
  key: DemoLogin,
  name: string,
  createdAt: Date,
): Promise<string> {
  const account = DEMO_ACCOUNTS[key];
  const [user] = await db
    .insert(schema.users)
    .values({
      username: account.login,
      displayUsername: account.login,
      name,
      email: `${account.login}@example.edu`,
      emailVerified: true,
      role: account.role,
      isDemo: true,
      createdAt,
      updatedAt: createdAt,
    })
    .returning({ id: schema.users.id });
  await db.insert(schema.accounts).values({
    accountId: user.id,
    providerId: "credential",
    userId: user.id,
    password: await hashOnce(account.password),
    createdAt,
    updatedAt: createdAt,
  });
  return user.id;
}

async function nextNumber(db: SeedDb, createdAt: Date) {
  const [{ seq }] = await db.execute<{ seq: string }>(
    sql`SELECT nextval('request_number_seq') AS seq`,
  );
  return formatRequestNumber(createdAt, Number(seq));
}

export async function seedDemoAccounts(db: SeedDb, d: SeedDates) {
  const created = d.at(-60, "09:00");

  // ── Структура вуза для демо-аккаунтов ─────────────────────────────────────
  const [econ, media, intl] = await db
    .insert(schema.faculties)
    .values([
      { code: "EK", title: "Факультет экономики" },
      { code: "CM", title: "Факультет цифровых медиа" },
      { code: "MO", title: "Факультет международных отношений" },
    ])
    .returning();
  const [econProgram, mediaProgram] = await db
    .insert(schema.programs)
    .values([
      { facultyId: econ.id, code: "38.03.01", title: "Экономика", level: "bachelor" },
      {
        facultyId: media.id,
        code: "42.04.02",
        title: "Цифровые медиа и коммуникации",
        level: "master",
      },
      { facultyId: intl.id, code: "41.03.05", title: "Международные отношения", level: "bachelor" },
    ])
    .returning();
  const [annaGroup, maximGroup] = await db
    .insert(schema.groups)
    .values([
      { programId: econProgram.id, title: "Б-ЭК-101", course: 1 },
      { programId: mediaProgram.id, title: "М-ЦМ-11", course: 1 },
    ])
    .returning();
  const [office, intlDean] = await db
    .insert(schema.units)
    .values([
      {
        facultyId: null,
        title: "Студенческий офис",
        place: "Каб. 112, корпус А",
        hours: "Пн–пт 10:00–17:00",
      },
      {
        facultyId: intl.id,
        title: "Деканат факультета международных отношений",
        place: "Каб. 305, корпус Б",
        hours: "Пн–чт 10:00–16:00",
      },
    ])
    .returning();

  // ── Люди ──────────────────────────────────────────────────────────────────
  const anna = await createUser(db, "anna", "Анна Соколова", created);
  const maxim = await createUser(db, "maxim", "Максим Орлов", created);
  const elena = await createUser(db, "elena", "Елена Миронова", created);
  const oleg = await createUser(db, "oleg", "Олег Белов", created);

  await db.insert(schema.studentProfiles).values([
    {
      userId: anna,
      lastName: "Соколова",
      firstName: "Анна",
      middleName: "Дмитриевна",
      displayName: "Аня",
      facultyId: econ.id,
      programId: econProgram.id,
      course: 1,
      groupId: annaGroup.id,
      studyForm: "full_time",
      studentCardNo: "DEMO-260101",
      admissionYear: 2026,
      onboardingDone: false,
    },
    {
      userId: maxim,
      lastName: "Орлов",
      firstName: "Максим",
      middleName: "Игоревич",
      displayName: "Максим",
      facultyId: media.id,
      programId: mediaProgram.id,
      course: 1,
      groupId: maximGroup.id,
      studyForm: "evening",
      studentCardNo: "DEMO-260211",
      admissionYear: 2026,
      onboardingDone: true,
    },
  ]);
  await db.insert(schema.staffProfiles).values([
    {
      userId: elena,
      lastName: "Миронова",
      firstName: "Елена",
      middleName: "Сергеевна",
      unitId: office.id,
      position: "Специалист студенческого офиса",
    },
    {
      userId: oleg,
      lastName: "Белов",
      firstName: "Олег",
      middleName: "Петрович",
      unitId: intlDean.id,
      position: "Специалист деканата",
    },
  ]);

  // ── Учёба демо-студентов (SPEC §11.1, §11.3). Популяция DS-40 эти группы не трогает ──────
  // Аня: риск по Микроэкономике, всё остальное достижимо. Максим: всё в порядке, пары после 19:00.
  const [kravtsova, petrov, wilson, lebedeva, gromov] = await db
    .insert(schema.teachers)
    .values([
      {
        fullName: "Кравцова Ирина Олеговна",
        email: "kravtsova.i@example.edu",
        officeHours: "Ср 15:00–16:30, ауд. 214",
      },
      {
        fullName: "Петров Андрей Викторович",
        email: "petrov.a@example.edu",
        officeHours: "Пн 14:10–15:30, ауд. 4010",
      },
      { fullName: "Уилсон Анна Робертовна", email: "wilson.a@example.edu", officeHours: null },
      {
        fullName: "Лебедева Марина Сергеевна",
        email: "lebedeva.m@example.edu",
        officeHours: "Вт 18:00–18:50, ауд. 512",
      },
      { fullName: "Громов Павел Ильич", email: "gromov.p@example.edu", officeHours: null },
    ])
    .returning();
  const [room214, room4012, room312, room512, room108] = await db
    .insert(schema.rooms)
    .values([
      { building: "А", number: "214", floor: 2, hint: null },
      { building: "А", number: "4012", floor: 4, hint: "Направо от лифта" },
      { building: "Б", number: "312", floor: 3, hint: null },
      { building: "В", number: "512", floor: 5, hint: null },
      { building: "В", number: "108", floor: 1, hint: "Вход со двора" },
    ])
    .returning();
  const [micro, macro, english, mediaAnalytics, digitalComm] = await db
    .insert(schema.courses)
    .values([
      {
        title: "Микроэкономика",
        shortTitle: "Микро",
        colorIndex: 2,
        control: "exam" as const,
        semester: "2026-1",
        leadTeacherId: kravtsova.id,
        rulesText: "Две контрольные, эссе и экзамен. Экзамен — половина итога.",
      },
      {
        title: "Макроэкономика",
        shortTitle: "Макро",
        colorIndex: 1,
        control: "exam" as const,
        semester: "2026-1",
        leadTeacherId: petrov.id,
        rulesText: "Контрольная, эссе и экзамен.",
      },
      {
        title: "Английский язык",
        shortTitle: "Англ.",
        colorIndex: 5,
        control: "credit" as const,
        semester: "2026-1",
        leadTeacherId: wilson.id,
        rulesText: "Зачёт: тест и проект, порог — 50 баллов.",
        passThreshold: 50,
      },
      {
        title: "Медиааналитика",
        shortTitle: "Медиа",
        colorIndex: 7,
        control: "graded_credit" as const,
        semester: "2026-1",
        leadTeacherId: lebedeva.id,
        rulesText: "Два кейса и итоговый проект.",
      },
      {
        title: "Цифровые коммуникации",
        shortTitle: "Цифр. ком.",
        colorIndex: 3,
        control: "exam" as const,
        semester: "2026-1",
        leadTeacherId: gromov.id,
        rulesText: "Эссе и экзамен.",
      },
    ])
    .returning();
  await db
    .insert(schema.enrollments)
    .values([
      ...[micro, macro, english].map((c) => ({ studentId: anna, courseId: c.id })),
      ...[mediaAnalytics, digitalComm].map((c) => ({ studentId: maxim, courseId: c.id })),
    ]);

  // Расписание на ±2 недели от сегодня (SPEC §11.3). Слоты пар — время МСК.
  const SLOT = {
    p1: ["09:30", "10:50"],
    p2: ["11:10", "12:30"],
    p3: ["12:40", "14:00"],
    p4: ["15:20", "16:40"],
    e1: ["19:00", "20:20"],
    e2: ["20:30", "21:50"],
  } as const;
  type Slot = keyof typeof SLOT;
  type Lesson = [Slot, typeof micro, typeof room214, string, "lecture" | "seminar" | "practice"];
  // Макроэкономика стоит в 12:40 каждый учебный день Ани, слот 15:20 свободен: туда переносится
  // демо-пара. Ключ — день недели ISO (1 — пн … 6 — сб).
  const annaWeek: Record<number, Lesson[]> = {
    1: [
      ["p1", english, room312, wilson.id, "practice"],
      ["p2", micro, room214, kravtsova.id, "lecture"],
      ["p3", macro, room4012, petrov.id, "lecture"],
    ],
    2: [
      ["p1", micro, room214, kravtsova.id, "seminar"],
      ["p3", macro, room4012, petrov.id, "seminar"],
    ],
    3: [
      ["p1", english, room312, wilson.id, "practice"],
      ["p2", micro, room214, kravtsova.id, "seminar"],
      ["p3", macro, room4012, petrov.id, "seminar"],
    ],
    4: [
      ["p1", micro, room214, kravtsova.id, "lecture"],
      ["p2", english, room312, wilson.id, "practice"],
      ["p3", macro, room4012, petrov.id, "seminar"],
    ],
    5: [
      ["p2", english, room312, wilson.id, "practice"],
      ["p3", macro, room4012, petrov.id, "lecture"],
    ],
    6: [
      ["p1", english, room312, wilson.id, "practice"],
      ["p3", macro, room4012, petrov.id, "seminar"],
    ],
  };
  const maximWeek: Record<number, Lesson[]> = {
    1: [["e1", mediaAnalytics, room512, lebedeva.id, "lecture"]],
    2: [
      ["e1", digitalComm, room108, gromov.id, "lecture"],
      ["e2", mediaAnalytics, room512, lebedeva.id, "practice"],
    ],
    3: [["e1", mediaAnalytics, room512, lebedeva.id, "seminar"]],
    4: [
      ["e1", digitalComm, room108, gromov.id, "seminar"],
      ["e2", digitalComm, room108, gromov.id, "practice"],
    ],
    5: [["e1", mediaAnalytics, room512, lebedeva.id, "practice"]],
  };
  const weekdayOf = (offset: number) => mskParts(d.at(offset, "12:00")).weekday;
  const lessonsFor = (week: Record<number, Lesson[]>, groupId: string) =>
    Array.from({ length: 29 }, (_, i) => i - 14).flatMap((offset) =>
      (week[weekdayOf(offset)] ?? []).map(([slot, course, room, teacherId, type]) => ({
        offset,
        slot,
        row: {
          courseId: course.id,
          groupId,
          type,
          startsAt: d.at(offset, SLOT[slot][0]),
          endsAt: d.at(offset, SLOT[slot][1]),
          roomId: room.id,
          teacherId,
        },
      })),
    );
  const annaLessons = lessonsFor(annaWeek, annaGroup.id);
  const maximLessons = lessonsFor(maximWeek, maximGroup.id);
  const classRows = await db
    .insert(schema.classes)
    .values([...annaLessons, ...maximLessons].map((l) => l.row))
    .returning({ id: schema.classes.id });

  // Демо-перенос: сегодня (в воскресенье — ближайший учебный день) Макроэкономика 12:40 → 15:20.
  const demoDay = d.nextStudyDayOffset();
  const movedIndex = annaLessons.findIndex((l) => l.offset === demoDay && l.slot === "p3");
  const movedAt = d.at(-1, "18:00");
  const [moved] = await db
    .insert(schema.scheduleChanges)
    .values({
      classId: classRows[movedIndex].id,
      type: "moved",
      newStartsAt: d.at(demoDay, SLOT.p4[0]),
      newEndsAt: d.at(demoDay, SLOT.p4[1]),
      newRoomId: room4012.id,
      reason: "Преподаватель на конференции утром",
      createdBy: elena,
      createdAt: movedAt,
    })
    .returning();

  // Оценки. Микроэкономика у Ани: сдано 11,5 из 50, для «удовл.» нужно 43,5 из 50 — риск.
  const [microQuiz1, microEssay, microQuiz2, , macroQuiz, macroEssay, , engTest] = await db
    .insert(schema.assessments)
    .values([
      {
        courseId: micro.id,
        title: "Контрольная 1",
        type: "test",
        maxScore: 10,
        weight: 0.15,
        dueAt: d.at(-30, "10:00"),
      },
      {
        courseId: micro.id,
        title: "Эссе",
        type: "essay",
        maxScore: 10,
        weight: 0.15,
        dueAt: d.at(-16, "23:59"),
      },
      {
        courseId: micro.id,
        title: "Контрольная 2",
        type: "test",
        maxScore: 10,
        weight: 0.2,
        dueAt: d.at(-9, "10:00"),
      },
      {
        courseId: micro.id,
        title: "Экзамен",
        type: "exam",
        maxScore: 100,
        weight: 0.5,
        dueAt: null,
      },
      {
        courseId: macro.id,
        title: "Контрольная",
        type: "test",
        maxScore: 10,
        weight: 0.3,
        dueAt: d.at(-10, "11:10"),
      },
      {
        courseId: macro.id,
        title: "Эссе по денежной политике",
        type: "essay",
        maxScore: 10,
        weight: 0.2,
        dueAt: d.at(1, "23:59"),
      },
      {
        courseId: macro.id,
        title: "Экзамен",
        type: "exam",
        maxScore: 100,
        weight: 0.5,
        dueAt: null,
      },
      {
        courseId: english.id,
        title: "Тест",
        type: "test",
        maxScore: 20,
        weight: 0.4,
        dueAt: d.at(-12, "09:30"),
      },
      {
        courseId: english.id,
        title: "Проект",
        type: "project",
        maxScore: 10,
        weight: 0.6,
        dueAt: d.at(12, "23:59"),
      },
    ])
    .returning();
  const [mediaCase1, mediaCase2, mediaProject, commEssay] = await db
    .insert(schema.assessments)
    .values([
      {
        courseId: mediaAnalytics.id,
        title: "Кейс 1",
        type: "case",
        maxScore: 10,
        weight: 0.3,
        dueAt: d.at(-20, "19:00"),
      },
      {
        courseId: mediaAnalytics.id,
        title: "Кейс 2",
        type: "case",
        maxScore: 10,
        weight: 0.3,
        dueAt: d.at(-6, "19:00"),
      },
      {
        courseId: mediaAnalytics.id,
        title: "Итоговый проект",
        type: "project",
        maxScore: 10,
        weight: 0.4,
        dueAt: d.at(10, "23:59"),
      },
      {
        courseId: digitalComm.id,
        title: "Эссе",
        type: "essay",
        maxScore: 20,
        weight: 0.4,
        dueAt: d.at(-8, "23:59"),
      },
      {
        courseId: digitalComm.id,
        title: "Экзамен",
        type: "exam",
        maxScore: 100,
        weight: 0.6,
        dueAt: null,
      },
    ])
    .returning();
  const graded = (
    assessmentId: string,
    studentId: string,
    score: number,
    offset: number,
    by: string,
  ) => ({
    assessmentId,
    studentId,
    score,
    gradedAt: d.at(offset, "18:00"),
    gradedBy: by,
  });
  const [annaQuiz1Grade] = await db
    .insert(schema.grades)
    .values([
      graded(microQuiz1.id, anna, 2, -28, kravtsova.id),
      graded(microEssay.id, anna, 3, -13, kravtsova.id),
      graded(microQuiz2.id, anna, 2, -7, kravtsova.id),
      graded(macroQuiz.id, anna, 8, -8, petrov.id),
      graded(engTest.id, anna, 18, -10, wilson.id),
      graded(mediaCase1.id, maxim, 9, -17, lebedeva.id),
      graded(mediaCase2.id, maxim, 8, -4, lebedeva.id),
      graded(commEssay.id, maxim, 17, -5, gromov.id),
    ])
    .returning();
  // История: оценку за контрольную исправили (SPEC §6.4 п.3).
  await db.insert(schema.gradeHistory).values([
    {
      gradeId: annaQuiz1Grade.id,
      oldScore: null,
      newScore: 1,
      changedAt: d.at(-29, "17:00"),
      changedBy: "Кравцова И. О.",
    },
    {
      gradeId: annaQuiz1Grade.id,
      oldScore: 1,
      newScore: 2,
      changedAt: d.at(-28, "18:00"),
      changedBy: "Кравцова И. О.",
    },
  ]);

  // Сессия через 3–5 недель (SPEC §11.3). Воскресенье сдвигается на понедельник.
  const sessionDay = (offset: number) => (weekdayOf(offset) === 7 ? offset + 1 : offset);
  const exams = await db
    .insert(schema.exams)
    .values(
      [
        { course: english, group: annaGroup, offset: 22, time: "10:00", room: room312 },
        { course: micro, group: annaGroup, offset: 26, time: "10:00", room: room214 },
        { course: macro, group: annaGroup, offset: 31, time: "10:00", room: room4012 },
        { course: mediaAnalytics, group: maximGroup, offset: 24, time: "19:00", room: room512 },
        { course: digitalComm, group: maximGroup, offset: 30, time: "19:00", room: room108 },
      ].map((e) => ({
        courseId: e.course.id,
        groupId: e.group.id,
        type: e.course.control,
        startsAt: d.at(sessionDay(e.offset), e.time),
        roomId: e.room.id,
        consultationAt:
          e.course.control === "exam" ? d.at(sessionDay(e.offset - 2), "15:20") : null,
      })),
    )
    .returning();
  await db.insert(schema.admissions).values(
    exams.map((e) => ({
      studentId: e.groupId === annaGroup.id ? anna : maxim,
      examId: e.id,
      admitted: null,
    })),
  );

  // Дедлайны: у Ани 3, горит эссе по Макроэкономике (завтра); у Максима 1, не горит.
  await db.insert(schema.deadlines).values([
    {
      studentId: anna,
      source: "assessment",
      assessmentId: macroEssay.id,
      courseId: macro.id,
      title: "Эссе по денежной политике",
      dueAt: macroEssay.dueAt!,
      starred: true,
      createdAt: created,
    },
    {
      studentId: anna,
      source: "personal",
      title: "Вопросы к консультации по микроэкономике",
      dueAt: d.at(4, "12:00"),
      createdAt: d.at(-2, "20:00"),
    },
    {
      studentId: anna,
      source: "admin",
      title: "Выбор курсов по выбору на весенний семестр",
      dueAt: d.at(9, "18:00"),
      createdAt: created,
    },
    {
      studentId: maxim,
      source: "assessment",
      assessmentId: mediaProject.id,
      courseId: mediaAnalytics.id,
      title: "Итоговый проект по медиааналитике",
      dueAt: mediaProject.dueAt!,
      createdAt: created,
    },
  ]);

  // Настройки уведомлений: у Ани — по умолчанию, у Максима — пресет «Вечерний».
  await db
    .insert(schema.notificationPrefs)
    .values([{ userId: anna }, { userId: maxim, preset: "evening", slots: [720, 1050, 1290] }]);

  // ── Заявки ────────────────────────────────────────────────────────────────
  // Аня: справка об обучении «в работе» (срок завтра) и справка о стипендии «готова».
  const annaStudyAt = d.at(-1, "10:15");
  const [annaStudy] = await db
    .insert(schema.requests)
    .values({
      number: await nextNumber(db, annaStudyAt),
      studentId: anna,
      typeCode: "study_cert",
      status: "in_progress",
      payload: { destination: "По месту требования" },
      delivery: "electronic",
      copies: 1,
      createdAt: annaStudyAt,
      dueAt: d.at(1, "18:00"),
      updatedAt: d.at(-1, "11:40"),
      studentSeenAt: annaStudyAt,
      assigneeId: elena,
    })
    .returning();
  const annaScholarAt = d.at(-4, "12:30");
  const [annaScholar] = await db
    .insert(schema.requests)
    .values({
      number: await nextNumber(db, annaScholarAt),
      studentId: anna,
      typeCode: "scholarship_cert",
      status: "ready",
      payload: { destination: "Отдел соцзащиты" },
      delivery: "original",
      copies: 2,
      createdAt: annaScholarAt,
      dueAt: d.at(-2, "18:00"),
      updatedAt: d.at(-2, "15:05"),
      studentSeenAt: d.at(-3, "09:00"),
      assigneeId: elena,
    })
    .returning();

  // Максим: выписка оценок «нужно уточнение».
  const maximAt = d.at(-3, "19:40");
  const [maximTranscript] = await db
    .insert(schema.requests)
    .values({
      number: await nextNumber(db, maximAt),
      studentId: maxim,
      typeCode: "transcript",
      status: "needs_info",
      payload: { destination: "Программа обмена" },
      delivery: "electronic",
      copies: 1,
      createdAt: maximAt,
      dueAt: d.at(4, "18:00"),
      updatedAt: d.at(-1, "14:20"),
      studentSeenAt: maximAt,
      assigneeId: elena,
    })
    .returning();

  await db.insert(schema.requestEvents).values([
    {
      requestId: annaStudy.id,
      fromStatus: null,
      toStatus: "submitted",
      actorId: anna,
      createdAt: annaStudyAt,
    },
    {
      requestId: annaStudy.id,
      fromStatus: "submitted",
      toStatus: "in_progress",
      actorId: elena,
      createdAt: d.at(-1, "11:40"),
    },
    {
      requestId: annaScholar.id,
      fromStatus: null,
      toStatus: "submitted",
      actorId: anna,
      createdAt: annaScholarAt,
    },
    {
      requestId: annaScholar.id,
      fromStatus: "submitted",
      toStatus: "in_progress",
      actorId: elena,
      createdAt: d.at(-3, "10:10"),
    },
    {
      requestId: annaScholar.id,
      fromStatus: "in_progress",
      toStatus: "ready",
      actorId: elena,
      createdAt: d.at(-2, "15:05"),
    },
    {
      requestId: maximTranscript.id,
      fromStatus: null,
      toStatus: "submitted",
      actorId: maxim,
      createdAt: maximAt,
    },
    {
      requestId: maximTranscript.id,
      fromStatus: "submitted",
      toStatus: "in_progress",
      actorId: elena,
      createdAt: d.at(-2, "10:00"),
    },
    {
      requestId: maximTranscript.id,
      fromStatus: "in_progress",
      toStatus: "needs_info",
      actorId: elena,
      comment: "Уточните, за какие семестры нужна выписка",
      createdAt: d.at(-1, "14:20"),
    },
  ]);
  await db.insert(schema.requestMessages).values({
    requestId: maximTranscript.id,
    authorId: elena,
    body: "Добрый день! Выписка нужна за все семестры или только за последний?",
    createdAt: d.at(-1, "14:20"),
  });

  // ── Уведомления демо-сценариев. Момент доставки посчитан вручную по правилам DS-02 ──────────
  // (срочное — сразу вне тихих часов; личное — в ближайший слот дайджеста 8:00 / 13:00 / 19:00).
  const note = (
    userId: string,
    rendered: ReturnType<typeof renderNotification>,
    linkId: string,
    createdAt: Date,
    deliverAt: Date,
    readAt: Date | null = null,
  ) => ({ userId, ...rendered, linkId, createdAt, deliverAt, readAt });
  await db.insert(schema.notifications).values([
    note(
      anna,
      renderNotification("schedule_moved", {
        course: macro.title,
        from: d.at(demoDay, SLOT.p3[0]),
        to: d.at(demoDay, SLOT.p4[0]),
        room: room4012.number,
      }),
      classRows[movedIndex].id,
      movedAt,
      movedAt,
    ),
    note(
      anna,
      renderNotification("request_ready", {
        requestTitle: "Справка о размере стипендии",
        number: annaScholar.number,
        electronic: false,
      }),
      annaScholar.id,
      d.at(-2, "15:05"),
      d.at(-2, "19:00"),
    ),
    note(
      anna,
      renderNotification("request_taken", {
        requestTitle: "Справка об обучении",
        number: annaStudy.number,
      }),
      annaStudy.id,
      d.at(-1, "11:40"),
      d.at(-1, "13:00"),
      d.at(-1, "13:20"),
    ),
    note(
      maxim,
      renderNotification("request_needs_info", {
        requestTitle: "Выписка оценок (академическая справка)",
        number: maximTranscript.number,
      }),
      maximTranscript.id,
      d.at(-1, "14:20"),
      d.at(-1, "14:20"),
    ),
  ]);

  // ── Очередь Елены (SPEC §11.1): 4 новых, 6 в работе, 1 из них просрочена ────────────────────
  // В работе уже справка Ани; ещё 5 «в работе» и 4 новых — от студентов очереди. Популяция DS-40
  // заявок в статусах submitted и in_progress не создаёт, чтобы счётчики очереди были точными.
  const queueStudents = [
    {
      login: "q.kovaleva",
      last: "Ковалёва",
      first: "Дарья",
      middle: "Андреевна",
      group: annaGroup,
      card: "DEMO-260301",
    },
    {
      login: "q.zakharov",
      last: "Захаров",
      first: "Илья",
      middle: "Романович",
      group: annaGroup,
      card: "DEMO-260302",
    },
    {
      login: "q.nikitina",
      last: "Никитина",
      first: "Полина",
      middle: null,
      group: maximGroup,
      card: "DEMO-260303",
    },
    {
      login: "q.smirnov",
      last: "Смирнов",
      first: "Артём",
      middle: "Олегович",
      group: maximGroup,
      card: "DEMO-260304",
    },
  ];
  const queueIds: string[] = [];
  for (const s of queueStudents) {
    const [user] = await db
      .insert(schema.users)
      .values({
        username: s.login,
        displayUsername: s.login,
        name: `${s.first} ${s.last}`,
        email: `${s.login}@example.edu`,
        emailVerified: true,
        role: "student",
        createdAt: created,
        updatedAt: created,
      })
      .returning({ id: schema.users.id });
    const anna1 = s.group.id === annaGroup.id;
    await db.insert(schema.studentProfiles).values({
      userId: user.id,
      lastName: s.last,
      firstName: s.first,
      middleName: s.middle,
      displayName: s.first,
      facultyId: anna1 ? econ.id : media.id,
      programId: anna1 ? econProgram.id : mediaProgram.id,
      course: 1,
      groupId: s.group.id,
      studyForm: anna1 ? "full_time" : "evening",
      studentCardNo: s.card,
      admissionYear: 2026,
      onboardingDone: true,
    });
    queueIds.push(user.id);
  }
  const queue: Array<{
    student: number;
    type: string;
    status: "submitted" | "in_progress";
    created: [number, string];
    due: [number, string];
    delivery: "electronic" | "original" | null;
    payload: Record<string, string | number>;
  }> = [
    {
      student: 0,
      type: "study_cert",
      status: "submitted",
      created: [-1, "16:20"],
      due: [1, "18:00"],
      delivery: "electronic",
      payload: { destination: "Банк" },
    },
    {
      student: 1,
      type: "military_cert",
      status: "submitted",
      created: [-1, "18:05"],
      due: [3, "18:00"],
      delivery: "original",
      payload: { destination: "Военный комиссариат" },
    },
    {
      student: 2,
      type: "dorm_cert",
      status: "submitted",
      created: [-2, "12:10"],
      due: [1, "18:00"],
      delivery: "electronic",
      payload: { destination: "Общежитие № 2" },
    },
    {
      student: 3,
      type: "app_free",
      status: "submitted",
      created: [-1, "09:45"],
      due: [5, "18:00"],
      delivery: null,
      payload: { text: "Прошу перенести консультацию" },
    },
    // Просрочена: срок вчера, ещё не готова.
    {
      student: 0,
      type: "transcript",
      status: "in_progress",
      created: [-8, "10:30"],
      due: [-1, "18:00"],
      delivery: "electronic",
      payload: { destination: "Стажировка" },
    },
    {
      student: 1,
      type: "scholarship_cert",
      status: "in_progress",
      created: [-2, "11:00"],
      due: [1, "18:00"],
      delivery: "electronic",
      payload: { destination: "Соцзащита" },
    },
    {
      student: 2,
      type: "pension_cert",
      status: "in_progress",
      created: [-2, "15:30"],
      due: [2, "18:00"],
      delivery: "original",
      payload: { destination: "Социальный фонд" },
    },
    {
      student: 3,
      type: "app_retake",
      status: "in_progress",
      created: [-3, "13:15"],
      due: [2, "18:00"],
      delivery: null,
      payload: { course: "Цифровые коммуникации" },
    },
    {
      student: 3,
      type: "study_cert",
      status: "in_progress",
      created: [-1, "10:00"],
      due: [1, "18:00"],
      delivery: "original",
      payload: { destination: "По месту работы" },
    },
  ];
  for (const q of queue) {
    const createdAt = d.at(...q.created);
    const takenAt = new Date(createdAt.getTime() + 50 * 60_000);
    const [req] = await db
      .insert(schema.requests)
      .values({
        number: await nextNumber(db, createdAt),
        studentId: queueIds[q.student],
        typeCode: q.type,
        status: q.status,
        payload: q.payload,
        delivery: q.delivery,
        copies: 1,
        createdAt,
        dueAt: d.at(...q.due),
        updatedAt: q.status === "in_progress" ? takenAt : createdAt,
        studentSeenAt: createdAt,
        assigneeId: q.status === "in_progress" ? elena : null,
      })
      .returning({ id: schema.requests.id });
    await db.insert(schema.requestEvents).values([
      {
        requestId: req.id,
        fromStatus: null,
        toStatus: "submitted",
        actorId: queueIds[q.student],
        createdAt,
      },
      ...(q.status === "in_progress"
        ? [
            {
              requestId: req.id,
              fromStatus: "submitted" as const,
              toStatus: "in_progress" as const,
              actorId: elena,
              createdAt: takenAt,
            },
          ]
        : []),
    ]);
  }

  return {
    users: { anna, maxim, elena, oleg },
    queueStudents: queueIds,
    demoChangeId: moved.id,
  };
}
