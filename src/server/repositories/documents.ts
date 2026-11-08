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

/** Действующий документ по заявке; студент — владелец (условие по studentId обязательно). */
export function findActiveDocumentOfRequest(tx: Tx, studentId: string, requestId: string) {
  return tx
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.requestId, requestId),
        eq(documents.studentId, studentId),
        isNull(documents.revokedAt),
      ),
    )
    .limit(1);
}

/** Запись о выданном документе (сотрудник, RLS documents_insert_staff). PDF строится при скачивании. */
export function insertDocument(
  tx: Tx,
  values: {
    id: string;
    requestId: string;
    studentId: string;
    fileKey: string;
    verifyTokenHash: string;
    issuedAt: Date;
  },
) {
  return tx.insert(documents).values(values);
}

/** Всё, что нужно для PDF: документ, его заявка и тип. Только действующий документ владельца. */
export async function findDocumentForRender(tx: Tx, studentId: string, documentId: string) {
  const [row] = await tx
    .select({
      id: documents.id,
      issuedAt: documents.issuedAt,
      requestNumber: requests.number,
      copies: requests.copies,
      fields: requests.payload,
      typeCode: requestTypes.code,
      typeTitle: requestTypes.title,
      formSchema: requestTypes.formSchema,
    })
    .from(documents)
    .innerJoin(requests, eq(requests.id, documents.requestId))
    .innerJoin(requestTypes, eq(requestTypes.code, requests.typeCode))
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.studentId, studentId),
        isNull(documents.revokedAt),
      ),
    )
    .limit(1);
  return row;
}
