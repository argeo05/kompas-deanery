import "server-only";
import { sql } from "drizzle-orm";
import { auditLog } from "../../db/schema";
import { now } from "@/lib/clock";
import type { Tx } from "./db";

// Аудит действий сотрудника (SPEC §6.9, §9.1). Вызывать внутри той же withUserTx, что и само изменение:
//   await audit(tx, "request.transition", "request", requestId, { from: "submitted", to: "in_progress" });
// Автор берётся из app.user_id транзакции — передать чужого автора нельзя.
// meta — только машинные значения (статусы, коды); без ФИО, текстов сообщений и прочего ввода пользователя.

export type AuditEntity =
  "request" | "document" | "announcement" | "schedule_change" | "ticket" | "demo";

export async function audit(
  tx: Tx,
  action: string,
  entity: AuditEntity,
  entityId: string | null,
  meta: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  await tx.insert(auditLog).values({
    actorId: sql`app_user_id()`,
    action,
    entity,
    entityId,
    at: now(),
    meta,
  });
}
