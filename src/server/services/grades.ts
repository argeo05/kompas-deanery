import "server-only";
import type { CourseGradesDTO, GradesDTO, MarkDTO, UUID } from "@/contracts/api";
import { MARK_THRESHOLDS } from "../../../config/grading";
import type { Item } from "@/lib/grading";
import { markFor, neededFor, totalScore } from "@/lib/grading";
import { semesterStatus } from "@/lib/semester-status";
import { now } from "@/lib/clock";
import { startOfDayMsk, toMsk } from "@/lib/time";
import type { Tx } from "../db";
import { HttpError } from "../http";
import {
  findEnrolledCourse,
  listCourseFinalResults,
  listCourseGradeHistory,
  type CourseExamRow,
  type FinalResultRow,
  type GradeItemRow,
  listGradesItems,
  listSemesterAdmissions,
  listSemesterCourses,
  listSemesterExams,
  listSemesterFinalResults,
  listStudentSemesters,
} from "../repositories/grades";
import type { GradesQuery } from "../schemas/grades";

// Сервис успеваемости студента (DS-12, DS-13; SPEC §6.4). Собирает DTO из строк репозитория;
// математика оценок — только DS-03 (src/lib/grading.ts), статус семестра — только DS-04
// (src/lib/semester-status.ts). Здесь их не дублируем.
//
// Семантика полей (детерминирована на сид-данных):
// - total — итог S по сданным элементам (DS-03); если есть final_results — его итог;
// - maxSoFar — «максимум на сегодня» для кольца прогресса: Σ wᵢ·100 по СДАННЫМ элементам,
//   округлённо до 1 знака (недосданные ещё не «доступны»);
// - mark — null, пока есть несданные элементы, а для зачёта всегда null: оценка появляется
//   только по завершённой дисциплине (final_results), иначе это был бы прогноз, а не оценка;
// - credit — только control = credit: passed из final_results, до него null; conditions —
//   элементы контроля с меткой «есть оценка» (label — название работы из справочника);
// - risk — дисциплина даёт хотя бы одну причину в reasons статуса семестра (DS-04);
// - daysToSession — полных календарных дней (МСК) от сегодня до ближайшего будущего
//   экзамена по дисциплинам семестра; экзаменов нет или все прошли → null.

const round1 = (v: number): number => Math.round(v * 10) / 10;

/** markFor (DS-03) → тройка контракта «98 / Отлично / A». */
const toMarkDTO = (m: { mark: 2 | 3 | 4 | 5; word: string; letter: string }): MarkDTO => ({
  value: m.mark,
  word: m.word,
  letter: m.letter,
});

/** Порог статуса семестра по дисциплине: «зачтено» из курса или «удовлетворительно» по умолчанию. */
const passThresholdOf = (passThreshold: number | null): number =>
  passThreshold ?? MARK_THRESHOLDS[3];

type GradesCourseDTO = GradesDTO["courses"][number];

interface CourseCalc {
  courseId: UUID;
  title: string;
  control: GradesCourseDTO["control"];
  grading: Item[];
  total: number;
  maxSoFar: number;
  mark: MarkDTO | null;
  credit: GradesCourseDTO["credit"];
  missedDeadlines: number;
}

const gradingItemsOf = (rows: GradeItemRow[]): Item[] =>
  rows.map((r) => ({ score: r.score, max: r.assessment.max, weight: r.assessment.weight }));

/** Пропущенные дедлайны дисциплины: срок прошёл, а оценки до сих пор нет. */
const missedDeadlinesOf = (rows: GradeItemRow[], at: Date): number =>
  rows.filter(
    (r) =>
      r.assessment.dueAt !== null &&
      r.assessment.dueAt.getTime() < at.getTime() &&
      r.score === null,
  ).length;

/** Допуск дисциплины: любое «нет» → false; все «да» → true; спорно или не решено → null. */
const admittedOf = (
  rows: Array<{ courseId: string; admitted: boolean | null }>,
  courseId: string,
): boolean | null => {
  const values = rows.filter((r) => r.courseId === courseId).map((r) => r.admitted);
  if (values.includes(false)) return false;
  return values.length > 0 && values.every((v) => v === true) ? true : null;
};

function calcCourse(
  course: {
    id: string;
    title: string;
    control: GradesCourseDTO["control"];
    passThreshold: number | null;
  },
  itemRows: GradeItemRow[],
  final: FinalResultRow | null,
  admitted: boolean | null,
  at: Date,
): CourseCalc {
  const grading = gradingItemsOf(itemRows);
  const allGraded = itemRows.length > 0 && itemRows.every((r) => r.score !== null);
  const total = final ? final.total : totalScore(grading);
  const maxSoFar = round1(
    itemRows.reduce((sum, r) => (r.score !== null ? sum + r.assessment.weight * 100 : sum), 0),
  );

  const mark: MarkDTO | null =
    course.control === "credit"
      ? null
      : final
        ? final.mark !== null
          ? toMarkDTO(markFor(total))
          : null
        : allGraded
          ? toMarkDTO(markFor(total))
          : null;

  const credit: GradesCourseDTO["credit"] =
    course.control !== "credit"
      ? null
      : {
          passed: final ? final.status === "passed" : null,
          conditions: itemRows.map((r) => ({ label: r.assessment.title, met: r.score !== null })),
        };

  return {
    courseId: course.id,
    title: course.title,
    control: course.control,
    grading,
    total,
    maxSoFar,
    mark,
    credit,
    missedDeadlines: missedDeadlinesOf(itemRows, at),
  };
}

/** Сводка семестра для GET /api/me/grades (DS-12). */
export async function semesterGrades(
  tx: Tx,
  studentId: string,
  q: GradesQuery,
): Promise<GradesDTO> {
  const semesters = await listStudentSemesters(tx, studentId);
  const semester = q.semester ?? semesters[0] ?? "";
  // Семестр — переключатель над своими данными: несуществующий → 404 NOT_FOUND
  // (как несуществующий ресурс; студент не должен прощупывать чужие семестры).
  if (semester !== "" && !semesters.includes(semester)) throw new HttpError(404, "NOT_FOUND");
  const at = now();

  if (semester === "") {
    // Совсем нет записей на курсы: пустая сводка с нулевым статусом.
    return {
      semester,
      semesters,
      status: { status: "ok", reasons: [] },
      averagePreliminary: null,
      daysToSession: null,
      courses: [],
    };
  }

  const courseRows = await listSemesterCourses(tx, studentId, semester);
  const courseIds = courseRows.map((c) => c.id);

  const [itemRows, finals, examRows, admissionRows] = await Promise.all([
    listGradesItems(tx, studentId, courseIds),
    listSemesterFinalResults(tx, studentId, semester),
    listSemesterExams(tx, courseIds),
    listSemesterAdmissions(tx, studentId, courseIds),
  ]);

  const itemsByCourse = new Map<string, GradeItemRow[]>();
  for (const row of itemRows) {
    const list = itemsByCourse.get(row.courseId);
    if (list) list.push(row);
    else itemsByCourse.set(row.courseId, [row]);
  }
  const finalsByCourse = new Map(finals.map((f) => [f.courseId, f]));
  const hasDebtCourseIds = new Set(
    finals.filter((f) => f.status === "debt").map((f) => f.courseId),
  );

  const calcList = courseRows.map((course) => {
    const admitted = admittedOf(admissionRows, course.id);
    return {
      calc: calcCourse(
        course,
        itemsByCourse.get(course.id) ?? [],
        finalsByCourse.get(course.id) ?? null,
        admitted,
        at,
      ),
      passThreshold: passThresholdOf(course.passThreshold),
      admitted,
    };
  });

  const standing = semesterStatus(
    calcList.map(({ calc: c, passThreshold, admitted }) => ({
      courseId: c.courseId,
      items: c.grading,
      passThreshold,
      admitted,
      hasDebt: hasDebtCourseIds.has(c.courseId),
      missedDeadlines: c.missedDeadlines,
    })),
  );
  const riskCourseIds = new Set(standing.reasons.map((r) => r.courseId));

  const courses: GradesCourseDTO[] = calcList
    .map(({ calc: c }) => ({
      courseId: c.courseId,
      title: c.title,
      control: c.control,
      total: c.total,
      maxSoFar: c.maxSoFar,
      mark: c.mark,
      credit: c.credit,
      risk: riskCourseIds.has(c.courseId),
    }))
    // SPEC §6.4 п.2: сначала дисциплины с рисками, дальше по названию.
    .sort(
      (a, b) =>
        Number(b.risk) - Number(a.risk) || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0),
    );

  // Средний балл «предварительно»: по дисциплинам, где уже есть хоть одна оценка.
  const gradedTotals = calcList
    .filter(({ calc: c }) => c.maxSoFar > 0)
    .map(({ calc: c }) => c.total);
  const averagePreliminary =
    gradedTotals.length === 0
      ? null
      : round1(gradedTotals.reduce((sum, t) => sum + t, 0) / gradedTotals.length);

  const upcoming: CourseExamRow | undefined = examRows.find(
    (e) => e.startsAt.getTime() >= at.getTime(),
  );
  const daysToSession = upcoming
    ? Math.max(
        0,
        Math.round(
          (startOfDayMsk(upcoming.startsAt).getTime() - startOfDayMsk(at).getTime()) / 86_400_000,
        ),
      )
    : null;

  return {
    semester,
    semesters,
    status: standing,
    averagePreliminary,
    daysToSession,
    courses,
  };
}

/** Карточка дисциплины студента для GET /api/me/grades/:courseId (DS-13); null → 404. */
export async function courseGrades(
  tx: Tx,
  studentId: string,
  courseId: string,
): Promise<CourseGradesDTO | null> {
  const course = await findEnrolledCourse(tx, studentId, courseId);
  if (!course) return null;
  const at = now();

  const [itemRows, history, finals] = await Promise.all([
    listGradesItems(tx, studentId, [courseId]),
    listCourseGradeHistory(tx, studentId, courseId),
    listCourseFinalResults(tx, studentId, courseId),
  ]);

  const calc = calcCourse(course, itemRows, finals[0] ?? null, null, at);

  return {
    courseId: course.id,
    title: course.title,
    teacher: {
      fullName: course.teacherFullName ?? "",
      email: course.teacherEmail,
      officeHours: course.teacherOfficeHours,
    },
    control: course.control,
    rulesText: course.rulesText,
    items: itemRows.map((r) => ({
      id: r.assessment.id,
      title: r.assessment.title,
      type: r.assessment.type,
      dueAt: r.assessment.dueAt ? toMsk(r.assessment.dueAt) : null,
      score: r.score,
      max: r.assessment.max,
      weight: r.assessment.weight,
      gradedAt: r.gradedAt ? toMsk(r.gradedAt) : null,
    })),
    history: history.map((h) => ({
      itemId: h.itemId,
      oldScore: h.oldScore,
      newScore: h.newScore,
      changedAt: toMsk(h.changedAt),
      changedBy: h.changedBy,
    })),
    total: calc.total,
    mark: calc.mark,
    needed: ([3, 4, 5] as const).map((target) => {
      const { needed, achievable } = neededFor(calc.grading, MARK_THRESHOLDS[target]);
      return { target, needed, achievable };
    }),
    peerGoal: null,
  };
}
