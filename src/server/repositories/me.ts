import "server-only";
import { eq } from "drizzle-orm";
import { faculties, groups, programs, studentProfiles, users } from "../../../db/schema";
import type { MeDTO } from "@/contracts/api";
import type { Tx } from "../db";

// Репозиторий профиля студента (DS-10). Запрос внутри withUserTx, условие по владельцу (userId/studentId).

/** Профиль студента для GET /api/me; null — профиля нет (403 у guard не случится, но страхуемся). */
export async function findMyProfile(tx: Tx, studentId: string): Promise<MeDTO | null> {
  const [row] = await tx
    .select({
      userId: studentProfiles.userId,
      login: users.username,
      last: studentProfiles.lastName,
      first: studentProfiles.firstName,
      middle: studentProfiles.middleName,
      displayName: studentProfiles.displayName,
      facultyId: faculties.id,
      facultyTitle: faculties.title,
      programId: programs.id,
      programCode: programs.code,
      programTitle: programs.title,
      programLevel: programs.level,
      course: studentProfiles.course,
      groupId: groups.id,
      groupTitle: groups.title,
      studyForm: studentProfiles.studyForm,
      studentCardNo: studentProfiles.studentCardNo,
      admissionYear: studentProfiles.admissionYear,
      status: studentProfiles.status,
      onboardingDone: studentProfiles.onboardingDone,
    })
    .from(studentProfiles)
    .innerJoin(users, eq(users.id, studentProfiles.userId))
    .innerJoin(faculties, eq(faculties.id, studentProfiles.facultyId))
    .innerJoin(programs, eq(programs.id, studentProfiles.programId))
    .innerJoin(groups, eq(groups.id, studentProfiles.groupId))
    .where(eq(studentProfiles.userId, studentId))
    .limit(1);
  if (!row) return null;
  return {
    userId: row.userId,
    login: row.login,
    role: "student",
    fullName: { last: row.last, first: row.first, middle: row.middle },
    displayName: row.displayName,
    faculty: { id: row.facultyId, title: row.facultyTitle },
    program: {
      id: row.programId,
      code: row.programCode,
      title: row.programTitle,
      level: row.programLevel,
    },
    course: row.course,
    group: { id: row.groupId, title: row.groupTitle },
    studyForm: row.studyForm,
    studentCardNo: row.studentCardNo,
    admissionYear: row.admissionYear,
    status: row.status,
    onboardingDone: row.onboardingDone,
  };
}

/** PATCH /api/me: displayName и/или onboardingDone. Возвращает обновлённый профиль. */
export async function updateMyProfile(
  tx: Tx,
  studentId: string,
  patch: { displayName?: string; onboardingDone?: boolean },
): Promise<void> {
  if (patch.displayName === undefined && patch.onboardingDone === undefined) return;
  await tx
    .update(studentProfiles)
    .set({
      ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
      ...(patch.onboardingDone !== undefined ? { onboardingDone: patch.onboardingDone } : {}),
    })
    .where(eq(studentProfiles.userId, studentId));
}
