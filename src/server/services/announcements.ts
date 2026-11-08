import "server-only";
import { z } from "zod";
import type {
  AnnouncementAudience,
  AnnouncementDTO,
  Paged,
  StaffAnnouncementDTO,
  UUID,
} from "@/contracts/api";
import { now } from "@/lib/clock";
import { toMsk } from "@/lib/time";
import type { StaffCtx, StudentCtx } from "../auth/guards";
import type { Tx } from "../db";
import { audit } from "../audit";
import { HttpError } from "../http";
import { renderNotification } from "../notify-templates";
import {
  archiveAnnouncementRow,
  findAnnouncementForStaff,
  findStaffName,
  findStudentCourse,
  insertAnnouncement,
  listAnnouncementsForStaff,
  listAudienceStudentIds,
  listExistingFacultyIds,
  listGroupFaculties,
  listVisibleAnnouncementsForStudent,
  type AnnouncementCursor,
  type AnnouncementRow,
} from "../repositories/announcements";
import {
  toAudience,
  type AnnouncementCreateInput,
  type AnnouncementsListQuery,
} from "../schemas/announcements";
import { notify } from "./notify";
import { staffShortName } from "./requests";

// Сервис объявлений (DS-31, SPEC §6.9). Все запросы выполняются в tx из withUserTx
// (app.user_id — сотрудник или студент); RLS (0001_rls.sql) — страховка, проверки области
// видимости и аудитории дублируются здесь.
//
// Принятые допущения v1.1 (подробности — docs/ds-questions/DS-31.md):
//   • аудитория AnnouncementAudience — объединение критериев: студент получает объявление,
//     если он в facultyIds, ИЛИ в groupIds, ИЛИ его курс обучения в courses; courses — номера
//     курса обучения (числа, как в контракте `courses?: number[]`), а не id дисциплин; при
//     заданных facultyIds номера курсов дополнительно срезаются по этим факультетам;
//   • видимость сотрудника: объявления подразделений СВОЕГО факультета
//     (units.faculty_id = ctx.facultyId); общевузовское подразделение (facultyId null) — все;
//   • publishAt в будущем: уведомление аудитории всё равно создаётся сейчас (deliverAt по DS-02)
//     — оно может прийти раньше публикации, принимаем как упрощение v1.1;
//   • повторный архив → 409 CONFLICT (archivedAt уже стоит).

// ── DTO ─────────────────────────────────────────────────────────────────────

function toStaffAnnouncementDTO(row: AnnouncementRow): StaffAnnouncementDTO {
  const a = row.a;
  return {
    id: a.id,
    title: a.title,
    bodyMd: a.bodyMd,
    important: a.important,
    publishedAt: toMsk(a.publishAt),
    expiresAt: a.expiresAt ? toMsk(a.expiresAt) : null,
    audience: a.audience,
    publishAt: toMsk(a.publishAt),
    archivedAt: a.archivedAt ? toMsk(a.archivedAt) : null,
    author: staffShortName(row.author) ?? "",
  };
}

function toAnnouncementDTO(a: {
  id: string;
  title: string;
  bodyMd: string;
  important: boolean;
  publishAt: Date;
  expiresAt: Date | null;
}): AnnouncementDTO {
  return {
    id: a.id,
    title: a.title,
    bodyMd: a.bodyMd,
    important: a.important,
    publishedAt: toMsk(a.publishAt),
    expiresAt: a.expiresAt ? toMsk(a.expiresAt) : null,
  };
}

// ── Курсор ──────────────────────────────────────────────────────────────────

// base64url от «ISO-момент|id» последней строки страницы; момент — createdAt (staff-список)
// или publishAt (студенческий список), поле расставляет вызывающая функция.
function encodeCursor(c: AnnouncementCursor): string {
  return Buffer.from(`${c.at.toISOString()}|${c.id}`).toString("base64url");
}

function decodeCursor(raw: string): AnnouncementCursor {
  const [iso, id] = Buffer.from(raw, "base64url").toString("utf8").split("|");
  const at = new Date(iso ?? "");
  // id проверяем строго: 36 дефисов прошли бы регулярку и уронили бы ::uuid в БД (500).
  if (Number.isNaN(at.getTime()) || !z.uuid().safeParse(id).success) {
    throw new HttpError(422, "VALIDATION", {
      issues: [{ path: "cursor", code: "invalid_cursor" }],
    });
  }
  return { at, id };
}

// ── Список сотрудника ───────────────────────────────────────────────────────

/** GET /api/staff/announcements — все объявления подразделений факультета, даже будущие и истёкшие. */
export async function listStaffAnnouncements(
  tx: Tx,
  ctx: StaffCtx,
  q: AnnouncementsListQuery,
): Promise<Paged<StaffAnnouncementDTO>> {
  const cursor = q.cursor ? decodeCursor(q.cursor) : null;
  const rows = await listAnnouncementsForStaff(tx, { facultyId: ctx.facultyId }, cursor, q.limit);
  const page = rows.slice(0, q.limit);
  const last = page.at(-1);
  return {
    items: page.map(toStaffAnnouncementDTO),
    nextCursor:
      rows.length > q.limit && last ? encodeCursor({ at: last.a.createdAt, id: last.a.id }) : null,
  };
}

// ── Аудитория: проверки принадлежности факультету ───────────────────────────

function audienceError(reason: "AUDIENCE_OUT_OF_FACULTY" | "AUDIENCE_NOT_FOUND"): never {
  throw new HttpError(422, "VALIDATION", { reason });
}

/**
 * Аудитория — только в пределах факультета сотрудника (DS-31): иные факультеты и группы
 * чужих факультетов → 422. `courses` — номера курса обучения, диапазон 1–6 уже в схеме Zod.
 * Общевузовское подразделение (facultyId null) выпускает объявления на любой факультет.
 */
async function assertAudienceWithinFaculty(
  tx: Tx,
  ctx: StaffCtx,
  audience: AnnouncementAudience,
): Promise<void> {
  const facultyIds = audience.facultyIds ?? [];
  const groupIds = audience.groupIds ?? [];

  if (facultyIds.length > 0) {
    // Несуществующее раньше «чужого»: несуществующий факультет — не в вузе вообще,
    // а не аудиторія другого факультета (AUDIENCE_NOT_FOUND тогда это 404-семантика).
    const existing = await listExistingFacultyIds(tx, facultyIds);
    if (existing.length !== new Set(facultyIds).size) audienceError("AUDIENCE_NOT_FOUND");
    const foreign = ctx.facultyId ? facultyIds.filter((id) => id !== ctx.facultyId) : [];
    if (foreign.length > 0) audienceError("AUDIENCE_OUT_OF_FACULTY");
  }

  if (groupIds.length > 0) {
    const rows = await listGroupFaculties(tx, groupIds);
    if (rows.length !== new Set(groupIds).size) audienceError("AUDIENCE_NOT_FOUND");
    if (ctx.facultyId && rows.some((g) => g.facultyId !== ctx.facultyId)) {
      audienceError("AUDIENCE_OUT_OF_FACULTY");
    }
  }
}

// ── Создание ────────────────────────────────────────────────────────────────

/**
 * POST /api/staff/announcements → 201. Объявление, аудит (audit_log) и уведомление аудитории
 * в одной транзакции. Класс уведомления: important → urgent, обычное → info (шаблоны Claude);
 * при отсутствующих критериях notify не создаёт ничего (пустая аудитория невозможна по схеме).
 */
export async function createAnnouncement(
  tx: Tx,
  ctx: StaffCtx,
  body: AnnouncementCreateInput,
): Promise<StaffAnnouncementDTO> {
  await assertAudienceWithinFaculty(tx, ctx, body.audience);

  const at = now();
  const publishAt = body.publishAt ? new Date(body.publishAt) : at;
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  // Явно заданный интервал «с … по …» не может идти вспять. Истёкший expiresAt при
  // неявной публикации «сейчас» разрешён: объявление рождается уже закрытым — на
  // совести сотрудника (иначе его нельзя было бы создать ради теста и «черновиков»).
  if (body.publishAt && expiresAt && publishAt.getTime() >= expiresAt.getTime()) {
    throw new HttpError(422, "VALIDATION", { reason: "INVALID_INTERVAL" });
  }

  const audience = toAudience(body, ctx.facultyId);
  const [a] = await insertAnnouncement(tx, {
    authorUnitId: ctx.unitId,
    createdBy: ctx.userId,
    title: body.title,
    bodyMd: body.bodyMd,
    audience,
    important: body.important,
    publishAt,
    expiresAt,
    archivedAt: null,
    createdAt: at,
  });

  await audit(tx, "announcement.create", "announcement", a.id, {
    important: body.important,
  });

  // Извещение аудиторию (DS-31): важное — срочное, обычное — информационное.
  const rendered = renderNotification(body.important ? "announcement_important" : "announcement", {
    title: body.title,
  });
  const recipients = await listAudienceStudentIds(
    tx,
    {
      facultyIds: audience.facultyIds ?? [],
      groupIds: audience.groupIds ?? [],
      courseNumbers: audience.courses ?? [],
    },
    ctx.facultyId,
  );
  await notify(tx, {
    studentIds: recipients.map((r) => r.userId),
    class: rendered.class,
    category: rendered.category,
    title: rendered.title,
    body: rendered.body,
    link: { kind: rendered.linkKind, id: a.id },
  });

  const [author] = await findStaffName(tx, ctx.userId);
  return toStaffAnnouncementDTO({
    a,
    author: { firstName: author?.firstName ?? null, lastName: author?.lastName ?? null },
  });
}

// ── Архив ───────────────────────────────────────────────────────────────────

/**
 * POST /api/staff/announcements/:id/archive. Объявление скрывается у студентов:
 * expiresAt = now() (и archivedAt). Чужой факультет и несуществующий id — 404;
 * повторный архив (archivedAt уже стоит) — 409 CONFLICT.
 */
export async function archiveAnnouncement(
  tx: Tx,
  ctx: StaffCtx,
  id: UUID,
): Promise<StaffAnnouncementDTO | null> {
  const row = await findAnnouncementForStaff(tx, { facultyId: ctx.facultyId }, id);
  if (!row) return null;
  if (row.a.archivedAt) throw new HttpError(409, "CONFLICT", { reason: "ALREADY_ARCHIVED" });

  const at = now();
  const [a] = await archiveAnnouncementRow(tx, id, at);
  await audit(tx, "announcement.archive", "announcement", id, {});
  return toStaffAnnouncementDTO({ a, author: row.author });
}

// ── Список студента ─────────────────────────────────────────────────────────

/**
 * GET /api/me/announcements — только видимые: publishAt ≤ now < (expiresAt ?? ∞) и студент
 * входит в аудиторию. Номер курса студента нужен для критерия «номер курса обучения».
 */
export async function listStudentAnnouncements(
  tx: Tx,
  ctx: StudentCtx,
  q: AnnouncementsListQuery,
): Promise<Paged<AnnouncementDTO>> {
  const cursor = q.cursor ? decodeCursor(q.cursor) : null;
  const course = await findStudentCourse(tx, ctx.studentId);
  const rows = await listVisibleAnnouncementsForStudent(
    tx,
    { facultyId: ctx.facultyId, groupId: ctx.groupId, course: course ?? 0 },
    cursor,
    q.limit,
    now(),
  );
  const page = rows.slice(0, q.limit);
  const last = page.at(-1);
  return {
    items: page.map(toAnnouncementDTO),
    nextCursor:
      rows.length > q.limit && last ? encodeCursor({ at: last.publishAt, id: last.id }) : null,
  };
}
