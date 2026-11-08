import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  admissions,
  assessments,
  courses,
  enrollments,
  exams,
  finalResults,
  gradeHistory,
  grades,
  teachers,
} from "../../../db/schema";
import type { Tx } from "../db";

// Репозиторий успеваемости студента (DS-12, DS-13). Все запросы внутри withUserTx.
// Правила: функция принимает tx и studentId из сессии; КАЖДЫЙ запрос к личным таблицам
// (enrollments, grades, grade_history, final_results, admissions) содержит условие по владельцу.
// Функций «по id без владельца» здесь нет и быть не должно.

/** Список семестров студента для переключателя (GradesDTO.semesters), свежие первыми. */
export async function listStudentSemesters(tx: Tx, studentId: string): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ semester: courses.semester })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(eq(enrollments.studentId, studentId))
    .orderBy(desc(courses.semester));
  return rows.map((r) => r.semester);
}

export interface SemesterCourseRow {
  id: string;
  title: string;
  control: "exam" | "credit" | "graded_credit";
  /** null — порог «удовлетворительно» по умолчанию (config/grading.ts). */
  passThreshold: number | null;
}

/** Дисциплины студента выбранного семестра (GradesDTO.courses), по названию. */
export function listSemesterCourses(tx: Tx, studentId: string, semester: string) {
  return tx
    .select({
      id: courses.id,
      title: courses.title,
      control: courses.control,
      passThreshold: courses.passThreshold,
    })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(and(eq(enrollments.studentId, studentId), eq(courses.semester, semester)))
    .orderBy(asc(courses.title), asc(courses.id));
}

export interface GradeItemRow {
  courseId: string;
  assessment: {
    id: string;
    title: string;
    type: string;
    dueAt: Date | null;
    max: number;
    weight: number;
  };
  /** null — ещё не сдано (нет записи или балл не выставлен). */
  score: number | null;
  gradedAt: Date | null;
}

/** Элементы контроля дисциплин студента вместе с его оценкой (CourseGradesDTO.items). */
export function listGradesItems(
  tx: Tx,
  studentId: string,
  courseIds: readonly string[],
): Promise<GradeItemRow[]> {
  if (courseIds.length === 0) return Promise.resolve([]);
  return (
    tx
      .select({
        courseId: assessments.courseId,
        assessment: {
          id: assessments.id,
          title: assessments.title,
          type: assessments.type,
          dueAt: assessments.dueAt,
          max: assessments.maxScore,
          weight: assessments.weight,
        },
        score: grades.score,
        gradedAt: grades.gradedAt,
      })
      .from(assessments)
      // RLS grades всё равно оставит только свои строки; условие по владельцу — обязательная страховка.
      .leftJoin(
        grades,
        and(eq(grades.assessmentId, assessments.id), eq(grades.studentId, studentId)),
      )
      .where(inArray(assessments.courseId, [...courseIds]))
      .orderBy(asc(assessments.dueAt), asc(assessments.id))
  );
}

export interface FinalResultRow {
  courseId: string;
  total: number;
  mark: number | null;
  status: string;
}

/** Итоговые результаты студента за семестр (для total/mark и академической задолженности). */
export function listSemesterFinalResults(tx: Tx, studentId: string, semester: string) {
  return tx
    .select({
      courseId: finalResults.courseId,
      total: finalResults.total,
      mark: finalResults.mark,
      status: finalResults.status,
    })
    .from(finalResults)
    .where(and(eq(finalResults.studentId, studentId), eq(finalResults.semester, semester)));
}

/** Итоговый результат студента по дисциплине (CourseGradesDTO). */
export function listCourseFinalResults(tx: Tx, studentId: string, courseId: string) {
  return tx
    .select({
      courseId: finalResults.courseId,
      total: finalResults.total,
      mark: finalResults.mark,
      status: finalResults.status,
    })
    .from(finalResults)
    .where(and(eq(finalResults.studentId, studentId), eq(finalResults.courseId, courseId)));
}

export interface CourseExamRow {
  id: string;
  courseId: string;
  startsAt: Date;
}

/** Экзамены и зачёты по дисциплинам студента — для daysToSession (GradesDTO), по времени. */
export function listSemesterExams(tx: Tx, courseIds: readonly string[]): Promise<CourseExamRow[]> {
  if (courseIds.length === 0) return Promise.resolve([]);
  return tx
    .select({ id: exams.id, courseId: exams.courseId, startsAt: exams.startsAt })
    .from(exams)
    .where(inArray(exams.courseId, [...courseIds]))
    .orderBy(asc(exams.startsAt), asc(exams.id));
}

/** Допуски студента к экзаменам его дисциплин (для статуса семестра, DS-04). */
export function listSemesterAdmissions(
  tx: Tx,
  studentId: string,
  courseIds: readonly string[],
): Promise<Array<{ courseId: string; admitted: boolean | null }>> {
  if (courseIds.length === 0) return Promise.resolve([]);
  return tx
    .select({ courseId: exams.courseId, admitted: admissions.admitted })
    .from(admissions)
    .innerJoin(exams, eq(exams.id, admissions.examId))
    .where(and(eq(admissions.studentId, studentId), inArray(exams.courseId, [...courseIds])));
}

export interface EnrolledCourseRow {
  id: string;
  title: string;
  control: "exam" | "credit" | "graded_credit";
  rulesText: string;
  passThreshold: number | null;
  teacherFullName: string | null;
  teacherEmail: string | null;
  teacherOfficeHours: string | null;
}

/** Дисциплина студента (по enrollments); null — чужая или несуществующая → 404 у обработчика. */
export async function findEnrolledCourse(
  tx: Tx,
  studentId: string,
  courseId: string,
): Promise<EnrolledCourseRow | null> {
  const [row] = await tx
    .select({
      id: courses.id,
      title: courses.title,
      control: courses.control,
      rulesText: courses.rulesText,
      passThreshold: courses.passThreshold,
      teacherFullName: teachers.fullName,
      teacherEmail: teachers.email,
      teacherOfficeHours: teachers.officeHours,
    })
    .from(courses)
    .innerJoin(
      enrollments,
      and(eq(enrollments.courseId, courses.id), eq(enrollments.studentId, studentId)),
    )
    .leftJoin(teachers, eq(teachers.id, courses.leadTeacherId))
    .where(eq(courses.id, courseId))
    .limit(1);
  return row ?? null;
}

export interface CourseHistoryRow {
  itemId: string;
  oldScore: number | null;
  newScore: number;
  changedAt: Date;
  changedBy: string;
}

/** История изменений оценок дисциплины студента (CourseGradesDTO.history), по времени. */
export function listCourseGradeHistory(
  tx: Tx,
  studentId: string,
  courseId: string,
): Promise<CourseHistoryRow[]> {
  return (
    tx
      .select({
        itemId: assessments.id,
        oldScore: gradeHistory.oldScore,
        newScore: gradeHistory.newScore,
        changedAt: gradeHistory.changedAt,
        changedBy: gradeHistory.changedBy,
      })
      .from(gradeHistory)
      .innerJoin(grades, eq(grades.id, gradeHistory.gradeId))
      .innerJoin(assessments, eq(assessments.id, grades.assessmentId))
      // Владелец — через grades.studentId: чужая история отсеивается и по RLS, и по этому условию.
      .where(and(eq(grades.studentId, studentId), eq(assessments.courseId, courseId)))
      .orderBy(asc(gradeHistory.changedAt), asc(gradeHistory.id))
  );
}
