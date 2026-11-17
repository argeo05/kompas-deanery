-- C5: нечёткий поиск (SPEC §6.10, AC-10.2). pg_trgm даёт similarity() для опечаток.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kb_articles_title_trgm_idx" ON "kb_articles" USING gin ("title" gin_trgm_ops);
