import "server-only";
import { and, asc, count, eq } from "drizzle-orm";
import type { AnnouncementAudience, AudienceCountDTO, StaffReferenceDTO } from "@/contracts/api";
import {
  faculties,
  groups,
  programs,
  requestTypes,
  rooms,
  staffProfiles,
  studentProfiles,
  teachers,
  units,
} from "../../../db/schema";
import type { StaffCtx } from "../auth/guards";
import type { Tx } from "../db";
import { listAudienceStudentIds } from "../repositories/announcements";

// Справочники для форм кабинета сотрудника (SPEC §6.9): группы и факультеты в области видимости
// сотрудника (общевузовское подразделение видит все), аудитории, преподаватели, типы заявок.
// Сами данные не личные; число студентов в группе считается под RLS сотрудника.

const initialOf = (value: string | null | undefined) => (value ?? "").trim().charAt(0).toUpperCase();

export async function getStaffReference(tx: Tx, ctx: StaffCtx): Promise<StaffReferenceDTO> {
  const scope = ctx.facultyId;
  const [me] = await tx
    .select({
      firstName: staffProfiles.firstName,
      lastName: staffProfiles.lastName,
      position: staffProfiles.position,
      unit: units.title,
    })
    .from(staffProfiles)
    .innerJoin(units, eq(units.id, staffProfiles.unitId))
    .where(eq(staffProfiles.userId, ctx.userId))
    .limit(1);

  const [facultyRows, groupRows, sizeRows, roomRows, teacherRows, typeRows] = await Promise.all([
    tx
      .select({ id: faculties.id, title: faculties.title })
      .from(faculties)
      .where(scope ? eq(faculties.id, scope) : undefined)
      .orderBy(asc(faculties.title)),
    tx
      .select({
        id: groups.id,
        title: groups.title,
        course: groups.course,
        facultyId: programs.facultyId,
      })
      .from(groups)
      .innerJoin(programs, eq(programs.id, groups.programId))
      .where(and(eq(groups.isSandbox, false), scope ? eq(programs.facultyId, scope) : undefined))
      .orderBy(asc(groups.title)),
    tx
      .select({ groupId: studentProfiles.groupId, n: count() })
      .from(studentProfiles)
      .groupBy(studentProfiles.groupId),
    tx
      .select({ id: rooms.id, building: rooms.building, number: rooms.number })
      .from(rooms)
      .orderBy(asc(rooms.building), asc(rooms.number)),
    tx
      .select({ id: teachers.id, fullName: teachers.fullName })
      .from(teachers)
      .orderBy(asc(teachers.fullName)),
    tx
      .select({ code: requestTypes.code, title: requestTypes.title })
      .from(requestTypes)
      .orderBy(asc(requestTypes.title)),
  ]);

  const sizes = new Map(sizeRows.map((r) => [r.groupId, r.n]));
  const first = me?.firstName ?? "";
  const last = me?.lastName ?? "";
  return {
    staff: {
      displayName: first ? `${first} ${last.charAt(0)}.`.trim() : last,
      initials: `${initialOf(first)}${initialOf(last)}` || "С",
      unit: me?.unit ?? "",
      position: me?.position ?? "",
    },
    faculties: facultyRows,
    groups: groupRows.map((g) => ({ ...g, students: sizes.get(g.id) ?? 0 })),
    rooms: roomRows.map((r) => ({ id: r.id, label: `${r.building}, ${r.number}` })),
    teachers: teacherRows,
    requestTypes: typeRows,
  };
}

/**
 * Сколько студентов получат объявление: тот же отбор, что и при публикации
 * (`listAudienceStudentIds`, пересечение критериев в пределах факультета сотрудника),
 * поэтому число на экране совпадает с числом уведомлений.
 */
export async function countAudience(
  tx: Tx,
  ctx: StaffCtx,
  audience: AnnouncementAudience,
): Promise<AudienceCountDTO> {
  const rows = await listAudienceStudentIds(
    tx,
    {
      facultyIds: audience.facultyIds ?? [],
      groupIds: audience.groupIds ?? [],
      courseNumbers: audience.courses ?? [],
    },
    ctx.facultyId,
  );
  return { students: rows.length };
}
