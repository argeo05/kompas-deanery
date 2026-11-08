import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { ApiErrorBody, DocumentDTO, DocumentsDTO, UUID } from "@/contracts/api";
import { toMsk } from "@/lib/time";
import { docPublicCode, docTokenHash } from "@/server/services/verify-code";
import * as s from "@db/schema";
import { getDb } from "@/server/db";
import { apiAs, countQueries, freezeTime, resetDb } from "../helpers/api";
import type { Fixtures } from "../helpers/fixtures";

// DS-19. GET /api/me/documents: контракт, единая формула verifyUrl, изоляция
// («Максим не видит документ Ани»), отозванный документ не показывается.
// В сиде у демо-студентов документов нет (их создаёт только популяция для фоновых
// студентов), поэтому документ для Ани вставляем самими тестами и чистим в finally.

const NOW = "2026-11-12T12:00:00+03:00";
const ISSUED_AT = new Date("2026-11-10T15:00:00+03:00");

let fx: Fixtures;
beforeAll(async () => {
  freezeTime(NOW);
  fx = await resetDb();
});

const db = () => getDb();

/** Документ для заявки студента с заранее известным id (нужен для docPublicCode). */
async function insertDocument(
  requestId: string,
  studentId: string,
  revoked = false,
): Promise<UUID> {
  const docId = randomUUID();
  await db()
    .insert(s.documents)
    .values({
      id: docId,
      requestId,
      studentId,
      fileKey: `test/${docId}.pdf`,
      verifyTokenHash: docTokenHash(docPublicCode(docId)),
      issuedAt: ISSUED_AT,
      ...(revoked ? { revokedAt: new Date("2026-11-11T09:00:00+03:00") } : {}),
    });
  return docId;
}

const deleteDocument = (docId: string) => db().delete(s.documents).where(eq(s.documents.id, docId));

describe("GET /api/me/documents", () => {
  it("в сиде у демо-студентов документов нет: пустой список в формате контракта", async () => {
    for (const actor of ["anna", "maxim"] as const) {
      const res = await apiAs(actor).get<DocumentsDTO>("/api/me/documents");
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.body).toEqual({ items: [] });
    }
  });

  it("документ владельца: все поля контракта, verifyUrl согласован с /api/verify", async () => {
    const requestId = fx.requests.anna[0]!;
    const docId = await insertDocument(requestId, fx.users.anna);
    try {
      const res = await apiAs("anna").get<DocumentsDTO>("/api/me/documents");
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toEqual({
        id: docId,
        requestId,
        // Заявка Ани №1 = study_cert; title из request_types (demo-accounts).
        typeTitle: "Справка об обучении",
        issuedAt: toMsk(ISSUED_AT),
        verifyUrl: `/verify/${docPublicCode(docId)}`,
        fileUrl: `/api/me/documents/${docId}/file`,
      } satisfies DocumentDTO);
      const code = res.body.items[0]!.verifyUrl.split("/verify/")[1]!;
      expect(code).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await deleteDocument(docId);
    }
  });

  it("Максим не видит документ Ани даже с подставленным studentId", async () => {
    const docId = await insertDocument(fx.requests.anna[0]!, fx.users.anna);
    try {
      const res = await apiAs("maxim").get<DocumentsDTO>(
        `/api/me/documents?studentId=${fx.users.anna}`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [] });
      expect(res.text).not.toContain(docId);
    } finally {
      await deleteDocument(docId);
    }
  });

  it("отозванный документ не выдаётся, действующий остаётся", async () => {
    const requestId = fx.requests.anna[0]!;
    const active = await insertDocument(requestId, fx.users.anna);
    const revoked = await insertDocument(requestId, fx.users.anna, true);
    try {
      const res = await apiAs("anna").get<DocumentsDTO>("/api/me/documents");
      expect(res.body.items.map((d) => d.id)).toEqual([active]);
    } finally {
      await deleteDocument(revoked);
      await deleteDocument(active);
    }
  });

  it("гость → 401, сотрудник → 403", async () => {
    const guest = await apiAs("guest").get<ApiErrorBody>("/api/me/documents");
    expect(guest.status).toBe(401);
    expect(guest.body).toEqual({ error: { code: "UNAUTHORIZED" } });
    const staff = await apiAs("elena").get<ApiErrorBody>("/api/me/documents");
    expect(staff.status).toBe(403);
    expect(staff.body).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  it("без N+1: число запросов не растёт с числом документов", async () => {
    const requestId = fx.requests.anna[0]!;
    const secondRequest = fx.requests.anna[1]!;
    const docId = await insertDocument(requestId, fx.users.anna);
    try {
      const small = await countQueries(() => apiAs("anna").get<DocumentsDTO>("/api/me/documents"));
      expect(small.result.body.items).toHaveLength(1);
      const docId2 = await insertDocument(secondRequest, fx.users.anna);
      try {
        const large = await countQueries(() =>
          apiAs("anna").get<DocumentsDTO>("/api/me/documents"),
        );
        expect(large.result.body.items).toHaveLength(2);
        expect(large.count).toBe(small.count);
      } finally {
        await deleteDocument(docId2);
      }
    } finally {
      await deleteDocument(docId);
    }
  });
});
