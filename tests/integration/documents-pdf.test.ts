import { beforeAll, describe, expect, it } from "vitest";
import type { DocumentsDTO, RequestDetailDTO, VerifyDTO } from "@/contracts/api";
import { renderDocumentPdf, WATERMARK_LINES, SIGNATURE_NOTE } from "@/server/pdf/document-pdf";
import { docPublicCode } from "@/server/services/verify-code";
import { apiAs, freezeTime, resetDb } from "../helpers/api";
import type { Fixtures } from "../helpers/fixtures";
import { pdfText } from "../helpers/pdf-text";

// C4, AC-5.3 и AC-5.5. «Готово» электронной справки выдаёт документ; PDF скачивает только владелец;
// в PDF есть водяной знак и QR на /verify; страница проверки не раскрывает ФИО.

const NOW = "2026-11-12T12:00:00+03:00";
let fx: Fixtures;
beforeAll(async () => {
  freezeTime(NOW);
  fx = await resetDb();
});

const verifyUrl = "http://localhost:3000/verify/abc";

describe("PDF справки", () => {
  it("водяной знак, подпись-заглушка и ссылка проверки есть в тексте PDF, QR — картинкой", async () => {
    const bytes = await renderDocumentPdf({
      typeCode: "study_cert",
      typeTitle: "Справка об обучении",
      requestNumber: "СП-2611-0001",
      issuedAtLabel: "12 ноября 2026 г.",
      fullName: "Иванова Анна Сергеевна",
      group: "Б-МН-101",
      program: "Менеджмент",
      faculty: "ФМО",
      course: 2,
      fields: [{ label: "Куда предоставляется справка", value: "в банк" }],
      verifyUrl,
    });
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const { text, images } = await pdfText(bytes);
    for (const line of WATERMARK_LINES) expect(text).toContain(line);
    expect(text).toContain(SIGNATURE_NOTE);
    expect(text.replaceAll(" ", "")).toContain(verifyUrl);
    expect(text).toContain("Иванова Анна Сергеевна");
    expect(images).toBeGreaterThanOrEqual(1);
  });
});

describe("выдача документа сотрудником", () => {
  it("ready выдаёт документ; студент скачивает PDF, чужой получает 404; /verify без ФИО", async () => {
    const id = fx.requests.anna[0];
    const take = await apiAs("elena").post(`/api/staff/requests/${id}/transition`, {
      action: "take",
    });
    expect([200, 409]).toContain(take.status);
    const ready = await apiAs("elena").post(`/api/staff/requests/${id}/transition`, {
      action: "ready",
    });
    expect(ready.status, ready.text).toBe(200);

    const card = await apiAs("anna").get<RequestDetailDTO>(`/api/me/requests/${id}`);
    expect(card.body.status).toBe("ready");
    expect(card.body.document).not.toBeNull();
    const documentId = card.body.document!.id;

    // Повторный ready невозможен (409), документ один.
    const docs = await apiAs("anna").get<DocumentsDTO>("/api/me/documents");
    expect(docs.body.items.filter((d) => d.requestId === id)).toHaveLength(1);

    const file = await apiAs("anna").get(`/api/me/documents/${documentId}/file`);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect(file.headers.get("content-disposition")).toContain("attachment");
    expect(file.text.startsWith("%PDF-")).toBe(true);

    for (const extra of [
      `/api/me/documents/${documentId}/file`,
      `/api/me/documents/${documentId}/file?studentId=${fx.users.anna}`,
    ]) {
      const foreign = await apiAs("maxim").get(extra);
      expect(foreign.status).toBe(404);
    }

    const checked = await apiAs("guest").get<VerifyDTO>(
      `/api/verify/${docPublicCode(documentId)}`,
      {
        headers: { "x-real-ip": "203.0.113.90" },
      },
    );
    expect(checked.body).toMatchObject({
      found: true,
      typeTitle: "Справка об обучении",
      valid: true,
    });
    expect(checked.text).not.toMatch(/Анн|Иванов|Петров|СП-/);
  });

  it("для бумажного оригинала электронный документ не создаётся", async () => {
    const created = await apiAs("anna").post<{ id: string }>(
      "/api/me/requests",
      {
        typeCode: "military_cert",
        delivery: "original",
        copies: 1,
        fields: { military_office: "Центральный" },
      },
      { headers: { "idempotency-key": "c4-original-0001" } },
    );
    expect(created.status, created.text).toBe(201);
    const id = created.body.id;
    await apiAs("elena").post(`/api/staff/requests/${id}/transition`, { action: "take" });
    await apiAs("elena").post(`/api/staff/requests/${id}/transition`, { action: "ready" });
    const card = await apiAs("anna").get<RequestDetailDTO>(`/api/me/requests/${id}`);
    expect(card.body.document).toBeNull();
    expect(card.body.pickup).not.toBeNull();
  });
});
