import { z } from "zod";
import { requireStudent } from "@/server/auth/guards";
import { notFound, noContent, route } from "@/server/http";
import { endMySession } from "@/server/services/sessions";

/** DELETE /api/me/sessions/:id → 204. Завершить один сеанс; чужой или несуществующий → 404. */
export const DELETE = route<{ id: string }>(async (req, ctx) => {
  const me = await requireStudent(req);
  const parsed = z.uuid().safeParse((await ctx.params).id);
  if (!parsed.success) notFound();
  if (!(await endMySession(me.userId, parsed.data))) notFound();
  return noContent();
});
