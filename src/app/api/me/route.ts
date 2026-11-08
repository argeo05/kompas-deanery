import type { MeDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { notFound, ok, parseJson, route } from "@/server/http";
import { mePatchBody } from "@/server/schemas/me";
import { getMyProfile, patchMyProfile } from "@/server/services/me";

/** GET /api/me → 200 MeDTO (DS-10). Копия структуры эталона src/app/api/me/requests/. */
export const GET = route(async (req) => {
  const me = await requireStudent(req);
  const profile = await withUserTx(me.userId, (tx) => getMyProfile(tx, me.studentId));
  if (!profile) notFound();
  return ok<MeDTO>(profile);
});

/** PATCH /api/me → 200 MeDTO. Разрешено менять только displayName и onboardingDone. */
export const PATCH = route(async (req) => {
  const me = await requireStudent(req);
  const body = await parseJson(req, mePatchBody);
  const profile = await withUserTx(me.userId, (tx) => patchMyProfile(tx, me.studentId, body));
  if (!profile) notFound();
  return ok<MeDTO>(profile);
});
