import type { Page } from "@playwright/test";
import type {
  ClassDTO,
  CourseGradesDTO,
  GradesDTO,
  ScheduleChangeDTO,
  ScheduleDTO,
  SessionDTO,
  TodayDTO,
} from "../../../src/contracts/api";

// Подмена ответов API на стороне браузера: ветки hero и виды изменений проверяются детерминированно,
// не завися от времени суток и сида. Реальные данные проверяют отдельные тесты со входом Анной.

export const DAY = "2026-11-12";
const at = (time: string, date = DAY) => `${date}T${time}:00+03:00`;

export function makeClass(over: Partial<ClassDTO> & { id: string; title: string }): ClassDTO {
  const { title, ...rest } = over;
  return {
    course: { id: `course-${over.id}`, title, shortTitle: title.slice(0, 6), colorIndex: 1 },
    type: "lecture",
    startsAt: at("09:30"),
    endsAt: at("11:00"),
    room: { id: "r1", building: "А", number: "312", floor: 3, hint: "Направо от лифта" },
    teacher: {
      id: "t1",
      fullName: "Петров Андрей Викторович",
      email: "p@example.edu",
      officeHours: "вт 15:00",
    },
    weekParity: "odd",
    change: null,
    note: null,
    ...rest,
  };
}

export function makeChange(
  type: ScheduleChangeDTO["type"],
  over: Partial<ScheduleChangeDTO> = {},
): ScheduleChangeDTO {
  return {
    id: `chg-${type}`,
    type,
    previous: { startsAt: at("12:40"), endsAt: at("14:00"), roomNumber: "101" },
    reason: type === "cancelled" ? "Болезнь преподавателя" : null,
    createdAt: at("08:00"),
    seen: false,
    ...over,
  };
}

export const THREE_CLASSES = [
  makeClass({ id: "c1", title: "Английский язык", startsAt: at("09:30"), endsAt: at("10:50") }),
  makeClass({ id: "c2", title: "Философия", startsAt: at("11:10"), endsAt: at("12:30") }),
  makeClass({ id: "c3", title: "Макроэкономика", startsAt: at("15:20"), endsAt: at("16:40") }),
];

export function makeToday(over: Partial<TodayDTO> = {}): TodayDTO {
  return {
    now: at("08:00"),
    greeting: "morning",
    hero: { kind: "soon", classId: "c1", startsAt: at("09:30") },
    classes: THREE_CLASSES,
    passedCount: 0,
    hot: [],
    news: [],
    dataAsOf: at("08:00"),
    ...over,
  };
}

export const mockJson = (page: Page, url: string | RegExp, body: unknown, status = 200) =>
  page.route(url, (route) => route.fulfill({ status, json: body }));

export function makeSchedule(
  classes: ClassDTO[],
  ghostSlots: ScheduleDTO["ghostSlots"] = [],
): ScheduleDTO {
  return {
    from: "2026-11-09",
    to: "2026-11-15",
    weekNumber: 11,
    weekParity: "odd",
    classes,
    ghostSlots,
  };
}

export function makeGrades(over: Partial<GradesDTO> = {}): GradesDTO {
  return {
    semester: "2026-1",
    semesters: ["2026-1"],
    status: { status: "ok", reasons: [] },
    averagePreliminary: 91.5,
    daysToSession: 24,
    courses: [
      {
        courseId: "11111111-1111-4111-8111-111111111111",
        title: "Макроэкономика",
        control: "exam",
        total: 98,
        maxSoFar: 100,
        mark: { value: 5, word: "Отлично", letter: "A" },
        credit: null,
        risk: false,
        passNeedShare: null,
      },
      {
        courseId: "22222222-2222-4222-8222-222222222222",
        title: "Английский язык",
        control: "credit",
        total: 0,
        maxSoFar: 0,
        mark: null,
        credit: {
          passed: null,
          conditions: [
            { label: "Посещаемость не ниже 70%", met: true },
            { label: "Проект сдан", met: false },
          ],
        },
        risk: false,
        passNeedShare: null,
      },
    ],
    ...over,
  };
}

export function makeCourse(over: Partial<CourseGradesDTO> = {}): CourseGradesDTO {
  return {
    courseId: "11111111-1111-4111-8111-111111111111",
    title: "Макроэкономика",
    teacher: {
      fullName: "Петров Андрей Викторович",
      email: "p@example.edu",
      officeHours: "вт 15:00",
    },
    control: "exam",
    rulesText: "Итог — сумма работ с весами.",
    items: [
      {
        id: "i1",
        title: "Контрольная",
        type: "test",
        dueAt: at("10:00", "2026-10-20"),
        score: 8,
        max: 10,
        weight: 0.4,
        gradedAt: at("12:00", "2026-10-22"),
      },
      {
        id: "i2",
        title: "Эссе",
        type: "essay",
        dueAt: at("23:59", "2026-11-13"),
        score: null,
        max: 10,
        weight: 0.6,
        gradedAt: null,
      },
    ],
    history: [
      {
        itemId: "i1",
        oldScore: 7,
        newScore: 8,
        changedAt: at("12:00", "2026-10-24"),
        changedBy: "Петров А. В.",
      },
    ],
    total: 32,
    mark: { value: 2, word: "Неудовлетворительно", letter: "F" },
    needed: [
      { target: 5, needed: 53, achievable: true },
      { target: 4, needed: 38, achievable: true },
      { target: 3, needed: 23, achievable: true },
    ],
    peerGoal: null,
    ...over,
  };
}

export const SESSION: SessionDTO = {
  startsOn: "2027-01-12",
  endsOn: "2027-01-20",
  items: [
    {
      id: "e1",
      courseTitle: "Макроэкономика",
      type: "exam",
      startsAt: "2027-01-12T09:30:00+03:00",
      room: "А-4012",
      consultationAt: "2027-01-11T12:00:00+03:00",
      admitted: true,
      admissionReason: null,
    },
    {
      id: "e2",
      courseTitle: "Философия",
      type: "graded_credit",
      startsAt: "2027-01-15T11:10:00+03:00",
      room: "Б-207",
      consultationAt: null,
      admitted: false,
      admissionReason: "Не сдан реферат",
    },
  ],
};
