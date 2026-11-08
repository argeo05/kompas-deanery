-- RLS: третий уровень защиты «студент видит только свои данные» (SPEC §9.3 п.3).
--
-- Как устроено:
--   • Приложение подключается владельцем БД (миграции, сид, Better Auth), а запросы к личным данным
--     выполняет в withUserTx (src/server/db.ts): SET LOCAL ROLE kompas_app + set_config('app.user_id').
--     Владелец таблиц RLS обходит, роль kompas_app — нет.
--   • Студент — владелец строк со student_id/user_id = app.user_id.
--   • Сотрудник видит студентов своего факультета; подразделение без факультета (студенческий офис) — всех.
--     Оценки сотрудник не видит (SPEC §5.1).
--   • История заявки, история оценок и аудит только дописываются: UPDATE/DELETE у роли отозваны.
-- Новая личная таблица: включить RLS, добавить политики здесь (новой миграцией) и в tests/security/rls.spec.ts.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kompas_app') THEN
    CREATE ROLE kompas_app NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN EXECUTE format('GRANT kompas_app TO %I', current_user); END $$;
--> statement-breakpoint

-- ── Права роли приложения ────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO kompas_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kompas_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kompas_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kompas_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO kompas_app;
--> statement-breakpoint

-- Таблицы Better Auth роли приложения не нужны (с ними работает только Better Auth от владельца).
-- Из users — только безопасные колонки, без e-mail.
REVOKE ALL ON users, sessions, accounts, verifications, rate_limits FROM kompas_app;
--> statement-breakpoint
GRANT SELECT (id, login, name, role, is_demo) ON users TO kompas_app;
--> statement-breakpoint

-- Справочники — только чтение.
REVOKE INSERT, UPDATE, DELETE ON faculties, programs, groups, units, staff_profiles, teachers, rooms, courses,
  classes, assessments, exams, request_types, kb_articles FROM kompas_app;
--> statement-breakpoint

-- Только дописываются (SPEC §6.5 «Тонкости», §9.1).
REVOKE UPDATE, DELETE ON request_events, grade_history, audit_log, events FROM kompas_app;
--> statement-breakpoint

-- Студент меняет в профиле только отображаемое имя и флаг онбординга (DS-10).
REVOKE UPDATE ON student_profiles FROM kompas_app;
--> statement-breakpoint
GRANT UPDATE (display_name, onboarding_done) ON student_profiles TO kompas_app;
--> statement-breakpoint

-- ── Функции для политик ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;
--> statement-breakpoint

-- SECURITY DEFINER: функции читают профили в обход RLS, но отвечают только «да/нет».
CREATE OR REPLACE FUNCTION app_is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM staff_profiles WHERE user_id = app_user_id())
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_staff_sees_student(student uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM staff_profiles st
    JOIN units u ON u.id = st.unit_id
    JOIN student_profiles sp ON sp.user_id = student
    WHERE st.user_id = app_user_id()
      AND (u.faculty_id IS NULL OR u.faculty_id = sp.faculty_id)
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_owns_or_staff(student uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT student = app_user_id() OR app_staff_sees_student(student)
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_can_see_request(request uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM requests r WHERE r.id = request AND app_owns_or_staff(r.student_id))
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_can_see_ticket(ticket uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM tickets t WHERE t.id = ticket AND app_owns_or_staff(t.student_id))
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_owns_grade(grade uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM grades g WHERE g.id = grade AND g.student_id = app_user_id())
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app_is_staff(), app_staff_sees_student(uuid), app_owns_or_staff(uuid),
  app_can_see_request(uuid), app_can_see_ticket(uuid), app_owns_grade(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_is_staff(), app_staff_sees_student(uuid), app_owns_or_staff(uuid),
  app_can_see_request(uuid), app_can_see_ticket(uuid), app_owns_grade(uuid) TO kompas_app;
--> statement-breakpoint

-- ── Включаем RLS ─────────────────────────────────────────────────────────────
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE class_notes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE schedule_change_views ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE grade_history ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE final_results ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admissions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE request_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE request_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification_prefs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE deadlines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ics_tokens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE schedule_changes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ── Политики ─────────────────────────────────────────────────────────────────
-- Профиль: свой — читать и менять (разрешённые колонки); сотрудник — читать студентов своего факультета.
CREATE POLICY student_profiles_select ON student_profiles FOR SELECT TO kompas_app
  USING (app_owns_or_staff(user_id));
--> statement-breakpoint
CREATE POLICY student_profiles_update_own ON student_profiles FOR UPDATE TO kompas_app
  USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());
--> statement-breakpoint

-- Учебные данные: студент только читает свои; сотрудник видит записи на курсы (для уведомлений), но не оценки.
CREATE POLICY enrollments_select ON enrollments FOR SELECT TO kompas_app
  USING (app_owns_or_staff(student_id));
--> statement-breakpoint
CREATE POLICY grades_select_own ON grades FOR SELECT TO kompas_app
  USING (student_id = app_user_id());
--> statement-breakpoint
CREATE POLICY grade_history_select_own ON grade_history FOR SELECT TO kompas_app
  USING (app_owns_grade(grade_id));
--> statement-breakpoint
CREATE POLICY final_results_select_own ON final_results FOR SELECT TO kompas_app
  USING (student_id = app_user_id());
--> statement-breakpoint
CREATE POLICY admissions_select_own ON admissions FOR SELECT TO kompas_app
  USING (student_id = app_user_id());
--> statement-breakpoint

-- Личные записи студента: полностью свои.
CREATE POLICY class_notes_own ON class_notes FOR ALL TO kompas_app
  USING (student_id = app_user_id()) WITH CHECK (student_id = app_user_id());
--> statement-breakpoint
CREATE POLICY schedule_change_views_own ON schedule_change_views FOR ALL TO kompas_app
  USING (student_id = app_user_id()) WITH CHECK (student_id = app_user_id());
--> statement-breakpoint
CREATE POLICY deadlines_own ON deadlines FOR ALL TO kompas_app
  USING (student_id = app_user_id()) WITH CHECK (student_id = app_user_id());
--> statement-breakpoint
CREATE POLICY plans_own ON plans FOR ALL TO kompas_app
  USING (student_id = app_user_id()) WITH CHECK (student_id = app_user_id());
--> statement-breakpoint
CREATE POLICY ics_tokens_own ON ics_tokens FOR ALL TO kompas_app
  USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY idempotency_keys_own ON idempotency_keys FOR ALL TO kompas_app
  USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());
--> statement-breakpoint

-- Заявки: студент создаёт свои; читают и меняют владелец и сотрудник факультета. Удаления нет.
CREATE POLICY requests_select ON requests FOR SELECT TO kompas_app
  USING (app_owns_or_staff(student_id));
--> statement-breakpoint
CREATE POLICY requests_insert_own ON requests FOR INSERT TO kompas_app
  WITH CHECK (student_id = app_user_id());
--> statement-breakpoint
CREATE POLICY requests_update ON requests FOR UPDATE TO kompas_app
  USING (app_owns_or_staff(student_id)) WITH CHECK (app_owns_or_staff(student_id));
--> statement-breakpoint
CREATE POLICY request_events_select ON request_events FOR SELECT TO kompas_app
  USING (app_can_see_request(request_id));
--> statement-breakpoint
CREATE POLICY request_events_insert ON request_events FOR INSERT TO kompas_app
  WITH CHECK (app_can_see_request(request_id) AND actor_id = app_user_id());
--> statement-breakpoint
CREATE POLICY request_messages_select ON request_messages FOR SELECT TO kompas_app
  USING (app_can_see_request(request_id));
--> statement-breakpoint
CREATE POLICY request_messages_insert ON request_messages FOR INSERT TO kompas_app
  WITH CHECK (app_can_see_request(request_id) AND author_id = app_user_id());
--> statement-breakpoint

-- Документы выдаёт сотрудник; студент только читает свои.
CREATE POLICY documents_select ON documents FOR SELECT TO kompas_app
  USING (app_owns_or_staff(student_id));
--> statement-breakpoint
CREATE POLICY documents_insert_staff ON documents FOR INSERT TO kompas_app
  WITH CHECK (app_staff_sees_student(student_id));
--> statement-breakpoint
CREATE POLICY documents_update_staff ON documents FOR UPDATE TO kompas_app
  USING (app_staff_sees_student(student_id)) WITH CHECK (app_staff_sees_student(student_id));
--> statement-breakpoint

-- Уведомления: свои — полностью (прочитать, отметить, напоминание по плану);
-- сотрудник — создать и обновить (дебаунс) уведомления студентам своего факультета.
CREATE POLICY notifications_own ON notifications FOR ALL TO kompas_app
  USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY notifications_staff_select ON notifications FOR SELECT TO kompas_app
  USING (app_staff_sees_student(user_id));
--> statement-breakpoint
CREATE POLICY notifications_staff_insert ON notifications FOR INSERT TO kompas_app
  WITH CHECK (app_staff_sees_student(user_id));
--> statement-breakpoint
CREATE POLICY notifications_staff_update ON notifications FOR UPDATE TO kompas_app
  USING (app_staff_sees_student(user_id)) WITH CHECK (app_staff_sees_student(user_id));
--> statement-breakpoint
CREATE POLICY notification_prefs_own ON notification_prefs FOR ALL TO kompas_app
  USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY notification_prefs_staff_select ON notification_prefs FOR SELECT TO kompas_app
  USING (app_staff_sees_student(user_id));
--> statement-breakpoint

-- Обращения: как заявки.
CREATE POLICY tickets_select ON tickets FOR SELECT TO kompas_app
  USING (app_owns_or_staff(student_id));
--> statement-breakpoint
CREATE POLICY tickets_insert_own ON tickets FOR INSERT TO kompas_app
  WITH CHECK (student_id = app_user_id());
--> statement-breakpoint
CREATE POLICY tickets_update ON tickets FOR UPDATE TO kompas_app
  USING (app_owns_or_staff(student_id)) WITH CHECK (app_owns_or_staff(student_id));
--> statement-breakpoint
CREATE POLICY ticket_messages_select ON ticket_messages FOR SELECT TO kompas_app
  USING (app_can_see_ticket(ticket_id));
--> statement-breakpoint
CREATE POLICY ticket_messages_insert ON ticket_messages FOR INSERT TO kompas_app
  WITH CHECK (app_can_see_ticket(ticket_id) AND author_id = app_user_id());
--> statement-breakpoint

-- Общие данные, которые пишет только сотрудник.
CREATE POLICY schedule_changes_select ON schedule_changes FOR SELECT TO kompas_app USING (true);
--> statement-breakpoint
CREATE POLICY schedule_changes_insert_staff ON schedule_changes FOR INSERT TO kompas_app
  WITH CHECK (app_is_staff() AND created_by = app_user_id());
--> statement-breakpoint
CREATE POLICY announcements_select ON announcements FOR SELECT TO kompas_app USING (true);
--> statement-breakpoint
CREATE POLICY announcements_insert_staff ON announcements FOR INSERT TO kompas_app
  WITH CHECK (app_is_staff() AND created_by = app_user_id());
--> statement-breakpoint
CREATE POLICY announcements_update_staff ON announcements FOR UPDATE TO kompas_app
  USING (app_is_staff()) WITH CHECK (app_is_staff());
--> statement-breakpoint

-- Аудит: запись только от своего имени; читать журнал через роль приложения нельзя.
CREATE POLICY audit_log_insert ON audit_log FOR INSERT TO kompas_app
  WITH CHECK (actor_id = app_user_id());
