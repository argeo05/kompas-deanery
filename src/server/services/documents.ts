import "server-only";
import { randomUUID } from "node:crypto";
import type { DocumentDTO, DocumentsDTO, VerifyDTO } from "@/contracts/api";
import { now } from "@/lib/clock";
import { toMsk } from "@/lib/time";
import type { Tx } from "../db";
import {
  findActiveDocumentOfRequest,
  findDocumentByTokenHash,
  findDocumentForRender,
  insertDocument,
  listDocumentsForStudent,
} from "../repositories/documents";
import { findMyProfile } from "../repositories/me";
import { renderDocumentPdf } from "../pdf/document-pdf";
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

/**
 * Выдача электронного документа по заявке (SPEC §6.5): создаёт запись с хешем кода проверки.
 * Повторный вызов для той же заявки ничего не меняет. Сам PDF строится при скачивании из данных
 * заявки: файл нигде не лежит, поэтому его нельзя подменить, а код проверки не хранится.
 */
export async function issueDocument(
  tx: Tx,
  input: { requestId: string; studentId: string },
): Promise<{ id: string; created: boolean }> {
  const [existing] = await findActiveDocumentOfRequest(tx, input.studentId, input.requestId);
  if (existing) return { id: existing.id, created: false };
  const id = randomUUID();
  await insertDocument(tx, {
    id,
    requestId: input.requestId,
    studentId: input.studentId,
    fileKey: `documents/${input.requestId}/document.pdf`,
    verifyTokenHash: docTokenHash(docPublicCode(id)),
    issuedAt: now(),
  });
  return { id, created: true };
}

const issuedFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Имя скачиваемого файла; кириллица кодируется в заголовке (filename*). */
export function documentFileName(typeTitle: string, number: string): string {
  return `${typeTitle} ${number}.pdf`;
}

/**
 * GET /api/me/documents/:id/file — PDF документа студента. Чужой или отозванный → null (404).
 * origin нужен для абсолютной ссылки в QR: она должна открываться у человека, который сканирует.
 */
export async function renderMyDocument(
  tx: Tx,
  studentId: string,
  documentId: string,
  origin: string,
): Promise<{ bytes: Buffer; fileName: string } | null> {
  const doc = await findDocumentForRender(tx, studentId, documentId);
  if (!doc) return null;
  const me = await findMyProfile(tx, studentId);
  if (!me) return null;
  const shown = (name: string, value: string | number | undefined) =>
    value === undefined || value === "" ? null : { label: name, value: String(value) };
  const fields = [
    ...doc.formSchema.map((f) => shown(f.label, doc.fields[f.name])),
    shown("Количество экземпляров", doc.copies),
  ].filter((f): f is { label: string; value: string } => f !== null);
  const bytes = await renderDocumentPdf({
    typeCode: doc.typeCode,
    typeTitle: doc.typeTitle,
    requestNumber: doc.requestNumber,
    issuedAtLabel: issuedFormat.format(doc.issuedAt),
    fullName: [me.fullName.last, me.fullName.first, me.fullName.middle].filter(Boolean).join(" "),
    group: me.group.title,
    program: me.program.title,
    faculty: me.faculty.title,
    course: me.course,
    fields,
    verifyUrl: `${origin}/verify/${docPublicCode(doc.id)}`,
  });
  return { bytes, fileName: documentFileName(doc.typeTitle, doc.requestNumber) };
}
