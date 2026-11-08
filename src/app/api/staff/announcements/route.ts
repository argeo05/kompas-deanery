import type { Paged, StaffAnnouncementDTO } from "@/contracts/api";
import { requireStaff } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { ok, parseJson, parseQuery, route } from "@/server/http";
import { withIdempotency } from "@/server/idempotency";
import { announcementCreateBody, announcementsListQuery } from "@/server/schemas/announcements";
import { createAnnouncement, listStaffAnnouncements } from "@/server/services/announcements";

// Объявления для кабинета сотрудника (DS-31, SPEC §6.9). Область видимости — подразделения
// факультета сотрудника из requireStaff; общевузовское подразделение (facultyId null)
// видит все факультеты и выпускает объявления в любую аудиторию.
// Маршруты зарегистрированы в tests/security/manifest.ts (DS-31).

/** GET /api/staff/announcements?cursor=&limit= → 200 Paged<StaffAnnouncementDTO> (включая будущие и истёкшие). */
export const GET = route(async (req) => {
  const staff = await requireStaff(req);
  const query = parseQuery(req, announcementsListQuery);
  const page = await withUserTx(staff.userId, (tx) => listStaffAnnouncements(tx, staff, query));
  return ok<Paged<StaffAnnouncementDTO>>(page);
});

/** POST /api/staff/announcements → 201 StaffAnnouncementDTO; аудитория ограничена факультетом сотрудника. */
export const POST = route(async (req) => {
  const staff = await requireStaff(req);
  return withIdempotency(req, staff.userId, async () => {
    const body = await parseJson(req, announcementCreateBody);
    const dto = await withUserTx(staff.userId, (tx) => createAnnouncement(tx, staff, body));
    return ok<StaffAnnouncementDTO>(dto, { status: 201 });
  });
});
