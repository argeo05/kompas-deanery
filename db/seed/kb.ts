import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as schema from "../schema";
import type { SeedDb } from "./demo-accounts";

// Справочник студента (SPEC §11.4): 25 статей из content/kb/*.md. Файл = фронтматтер + Markdown.
// Вставка идемпотентна (upsert по slug), поэтому годится и для уже засеянной базы: pnpm db:seed-kb.

export interface KbFile {
  slug: string;
  title: string;
  tags: string[];
  updatedAt: Date;
  bodyMd: string;
}

export function parseKbFile(raw: string): KbFile {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw.replace(/\r\n/g, "\n"));
  if (!m) throw new Error("kb: нет фронтматтера");
  const meta = new Map<string, string>();
  for (const line of m[1]!.split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
  }
  const tags = (meta.get("tags") ?? "")
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const slug = meta.get("slug");
  const title = meta.get("title");
  if (!slug || !title) throw new Error("kb: нужны slug и title");
  return {
    slug,
    title,
    tags,
    updatedAt: new Date(`${meta.get("updatedAt") ?? "2026-11-01"}T09:00:00+03:00`),
    bodyMd: m[2]!.trim(),
  };
}

export function readKbFiles(dir = join(process.cwd(), "content", "kb")): KbFile[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => parseKbFile(readFileSync(join(dir, f), "utf8")));
}

export async function seedKb(db: SeedDb) {
  for (const a of readKbFiles()) {
    await db
      .insert(schema.kbArticles)
      .values(a)
      .onConflictDoUpdate({
        target: schema.kbArticles.slug,
        set: { title: a.title, bodyMd: a.bodyMd, tags: a.tags, updatedAt: a.updatedAt },
      });
  }
}
