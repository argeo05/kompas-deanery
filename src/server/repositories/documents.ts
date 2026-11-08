import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { documents, requestTypes, requests } from "../../../db/schema";
import type { Tx } from "../db";

// Репозиторий документов (DS-19). Правило: запросы к личным таблицам — внутри withUserTx
// и с условием по владельцу (documents.student_id = studentId из сессии).

/** Выданные (не отозванные) документы студента, новыми первыми, с типом их заявки. */
export function listDocumentsForStudent(tx: Tx, studentId: string) {
  return tx
    .select({ document: documents, typeTitle: requestTypes.title })
    .from(documents)
    .innerJoin(requests, eq(requests.id, documents.requestId))
    .innerJoin(requestTypes, eq(requestTypes.code, requests.typeCode))
    .where(and(eq(documents.studentId, studentId), isNull(documents.revokedAt)))
    .orderBy(desc(documents.issuedAt), desc(documents.id));
}

/**
 * Поиск по хешу публичного кода — для публичного /api/verify/:code (DS-23).
 * Отдаём только минимальные поля: ни ФИО, ни группы, ни номера заявки (SPEC §6.5 п.9).
 */
export function findDocumentByTokenHash(tx: Tx, tokenHash: string) {
  return tx
    .select({
      id: documents.id,
      issuedAt: documents.issuedAt,
      revokedAt: documents.revokedAt,
      typeTitle: requestTypes.title,
    })
    .from(documents)
    .innerJoin(requests, eq(requests.id, documents.requestId))
    .innerJoin(requestTypes, eq(requestTypes.code, requests.typeCode))
    .where(eq(documents.verifyTokenHash, tokenHash))
    .limit(1);
}
