import "server-only";
import { eq } from "drizzle-orm";
import { staffProfiles, studentProfiles, units } from "../../../db/schema";
import { getDb } from "../db";

// Контекст роли для guards. Читается соединением владельца по userId ИЗ СЕССИИ (никогда из запроса).

export async function findStudentContext(userId: string) {
  const [row] = await getDb()
    .select({ groupId: studentProfiles.groupId, facultyId: studentProfiles.facultyId })
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function findStaffContext(userId: string) {
  const [row] = await getDb()
    .select({ unitId: staffProfiles.unitId, facultyId: units.facultyId })
    .from(staffProfiles)
    .innerJoin(units, eq(units.id, staffProfiles.unitId))
    .where(eq(staffProfiles.userId, userId))
    .limit(1);
  return row ?? null;
}
