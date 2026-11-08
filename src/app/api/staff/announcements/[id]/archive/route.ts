import type { UUID, StaffAnnouncementDTO } from "@/contracts/api";
import { requireStaff } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { notFound, ok, route } from "@/server/http";
import { announcementIdParams } from "@/server/schemas/announcements";
import { archiveAnnouncement } from "@/server/services/announcements";

// Архив объявления (DS-31): expiresAt и archivedAt = now — объявление сразу пропадает у
// студентов, но остаётся в списке сотрудника. Чужой факультет, несуществующий и «кривой» id —
// одинаково 404; повторный архив — 409 CONFLICT.

/** POST /api/staff/announcements/:id/archive → 200 StaffAnnouncementDTO */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const staff = await requireStaff(req);
  const parsed = announcementIdParams.safeParse(await params);
  if (!parsed.success) notFound();
  const dto = await withUserTx(staff.userId, (tx) =>
    archiveAnnouncement(tx, staff, parsed.data.id as UUID),
  );
  if (!dto) notFound();
  return ok<StaffAnnouncementDTO>(dto);
});
