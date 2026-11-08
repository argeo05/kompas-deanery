-- Ревью фазы B (DS-22, DS-31), 08.11.2026.
-- ICS: поколение ссылки — токен выводится HMAC(секрет, user_id:generation), в БД только хеш.
ALTER TABLE "ics_tokens" ADD COLUMN "generation" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint

-- Объявления: сотрудник меняет (архивирует) только объявления подразделений своего факультета;
-- общевузовское подразделение (faculty_id IS NULL) — любые. Раньше USING (app_is_staff()).
CREATE OR REPLACE FUNCTION app_staff_sees_unit(unit uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM staff_profiles st
    JOIN units mine ON mine.id = st.unit_id
    JOIN units author ON author.id = unit
    WHERE st.user_id = app_user_id()
      AND (mine.faculty_id IS NULL OR mine.faculty_id = author.faculty_id)
  )
$$;
--> statement-breakpoint
DROP POLICY announcements_update_staff ON announcements;
--> statement-breakpoint
CREATE POLICY announcements_update_staff ON announcements FOR UPDATE TO kompas_app
  USING (app_staff_sees_unit(author_unit_id)) WITH CHECK (app_staff_sees_unit(author_unit_id));
