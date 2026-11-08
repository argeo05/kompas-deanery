import type { DocumentsDTO } from "@/contracts/api";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { ok, route } from "@/server/http";
import { listMyDocuments } from "@/server/services/documents";

// DS-19. Список выданных документов студента. Файл (PDF) отдаёт эндпоинт
// src/app/api/me/documents/[id]/file — его создаёт Claude (вне DS-19).

/** GET /api/me/documents → 200 DocumentsDTO (новые первыми). */
export const GET = route(async (req) => {
  const me = await requireStudent(req);
  const documents = await withUserTx(me.userId, (tx) => listMyDocuments(tx, me.studentId));
  return ok<DocumentsDTO>(documents);
});
