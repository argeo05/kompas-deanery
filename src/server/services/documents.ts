import "server-only";
import type { DocumentDTO, DocumentsDTO, VerifyDTO } from "@/contracts/api";
import { toMsk } from "@/lib/time";
import type { Tx } from "../db";
import { findDocumentByTokenHash, listDocumentsForStudent } from "../repositories/documents";
import { docPublicCode, docTokenHash } from "./verify-code";

// Сервис документов студента (DS-19, DS-23): собирает DTO из строк репозитория.

/** GET /api/me/documents — выданные справки студента. Файл отдаёт [id]/file (Claude). */
export async function listMyDocuments(tx: Tx, studentId: string): Promise<DocumentsDTO> {
  const rows = await listDocumentsForStudent(tx, studentId);
  return {
    items: rows.map(({ document, typeTitle }): DocumentDTO => {
      const verifyUrl = `/verify/${docPublicCode(document.id)}`;
      return {
        id: document.id,
        requestId: document.requestId,
        typeTitle,
        issuedAt: toMsk(document.issuedAt),
        verifyUrl,
        fileUrl: `/api/me/documents/${document.id}/file`,
      };
    }),
  };
}

/** GET /api/verify/:code — публичная проверка подлинности; нет совпадения → found: false (200). */
export async function checkVerifyCode(tx: Tx, code: string): Promise<VerifyDTO> {
  const [row] = await findDocumentByTokenHash(tx, docTokenHash(code));
  if (!row) return { found: false };
  return {
    found: true,
    typeTitle: row.typeTitle,
    issuedAt: toMsk(row.issuedAt),
    valid: row.revokedAt === null,
  };
}
