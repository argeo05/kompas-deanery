// Схема БД (SPEC §10.4). RLS-политики и роль приложения — в db/migrations/0001_rls.sql:
// новая личная таблица (со student_id/user_id) требует политики там же и строки в tests/security/rls.spec.ts.
export * from "./auth";
export * from "./people";
export * from "./study";
export * from "./requests";
export * from "./communication";
export * from "./system";
