import "server-only";
import { asc, eq } from "drizzle-orm";
import type { KbArticleDTO, KbListDTO } from "@/contracts/api";
import type { KbDoc } from "@/lib/assistant/engine";
import { toMsk } from "@/lib/time";
import { kbArticles } from "../../../db/schema";
import type { Tx } from "../db";

// Справочник студента (SPEC §11.4): общий для всех, поэтому без условия по владельцу.

export async function listKb(tx: Tx): Promise<KbListDTO> {
  const rows = await tx
    .select({ slug: kbArticles.slug, title: kbArticles.title, tags: kbArticles.tags })
    .from(kbArticles)
    .orderBy(asc(kbArticles.title));
  return { items: rows };
}

export async function getKbArticle(tx: Tx, slug: string): Promise<KbArticleDTO | null> {
  const [row] = await tx.select().from(kbArticles).where(eq(kbArticles.slug, slug));
  if (!row) return null;
  return {
    slug: row.slug,
    title: row.title,
    tags: row.tags,
    bodyMd: row.bodyMd,
    updatedAt: toMsk(row.updatedAt),
  };
}

/** Все статьи целиком — для помощника (SPEC §6.8.2): справочник общий, условия по владельцу нет. */
export async function listKbDocs(tx: Tx): Promise<KbDoc[]> {
  return tx
    .select({
      slug: kbArticles.slug,
      title: kbArticles.title,
      tags: kbArticles.tags,
      bodyMd: kbArticles.bodyMd,
    })
    .from(kbArticles)
    .orderBy(asc(kbArticles.slug));
}
