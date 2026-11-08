import "server-only";
import type { UUID } from "@/contracts/api";
import { HttpError } from "../http";
import { findStaffContext, findStudentContext } from "../repositories/session-context";
import { getAuth, type AuthSession } from "./index";

// Стражи доступа — первая строка каждого обработчика (SPEC §9.3, DEEPSEEK-TASKS §3).
// Нет сессии → 401 UNAUTHORIZED; не та роль → 403 FORBIDDEN.
// Идентификаторы берутся только из сессии: studentId/userId из пути, query и тела не читаются.

export interface StudentCtx {
  userId: UUID;
  /** Совпадает с userId: student_profiles.user_id — он же student_id в личных таблицах. */
  studentId: UUID;
  groupId: UUID;
  facultyId: UUID;
}

export interface StaffCtx {
  userId: UUID;
  /** Совпадает с userId (staff_profiles.user_id). */
  staffId: UUID;
  unitId: UUID;
  /** null — общевузовское подразделение (студенческий офис): видит все факультеты. */
  facultyId: UUID | null;
}

export async function getSession(req: Request): Promise<AuthSession | null> {
  return getAuth().api.getSession({ headers: req.headers });
}

async function requireSession(req: Request): Promise<AuthSession> {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, "UNAUTHORIZED");
  return session;
}

export async function requireStudent(req: Request): Promise<StudentCtx> {
  const { user } = await requireSession(req);
  if (user.role !== "student") throw new HttpError(403, "FORBIDDEN");
  const ctx = await findStudentContext(user.id);
  if (!ctx) throw new HttpError(403, "FORBIDDEN");
  return { userId: user.id, studentId: user.id, groupId: ctx.groupId, facultyId: ctx.facultyId };
}

export async function requireStaff(req: Request): Promise<StaffCtx> {
  const { user } = await requireSession(req);
  if (user.role !== "staff") throw new HttpError(403, "FORBIDDEN");
  const ctx = await findStaffContext(user.id);
  if (!ctx) throw new HttpError(403, "FORBIDDEN");
  return { userId: user.id, staffId: user.id, unitId: ctx.unitId, facultyId: ctx.facultyId };
}
