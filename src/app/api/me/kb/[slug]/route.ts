import type { KbArticleDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { notFound, ok, route } from "@/server/http";
import { getKbArticle } from "@/server/services/kb";

/** GET /api/me/kb/:slug → 200 KbArticleDTO; нет статьи — 404. */
export const GET = route<{ slug: string }>(async (req, { params }) => {
  const me = await requireStudent(req);
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  const article = await withUserTx(me.userId, (tx) => getKbArticle(tx, slug));
  if (!article) notFound();
  return ok<KbArticleDTO>(article);
});
