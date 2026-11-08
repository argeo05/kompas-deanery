import type { AnnouncementDTO, Paged } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { ok, parseQuery, route } from "@/server/http";
import { announcementsListQuery } from "@/server/schemas/announcements";
import { listStudentAnnouncements } from "@/server/services/announcements";

// Лента объявлений студента (DS-31, SPEC §6.6): только видимые — опубликованные, не истёкшие
// и адресованные аудитории студента (факультет / группа / курс обучения). bodyMd отдаётся как
// есть (Markdown); в HTML его превращает UI через санитайзер (SPEC §9.4).
// Маршрут зарегистрирован в tests/security/manifest.ts (DS-31).

/** GET /api/me/announcements?cursor=&limit= → 200 Paged<AnnouncementDTO> */
export const GET = route(async (req) => {
  const me = await requireStudent(req);
  const query = parseQuery(req, announcementsListQuery);
  const page = await withUserTx(me.userId, (tx) => listStudentAnnouncements(tx, me, query));
  return ok<Paged<AnnouncementDTO>>(page);
});
