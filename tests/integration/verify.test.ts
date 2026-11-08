import { randomUUID } from "node:crypto";
import { eq, isNull } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { VerifyDTO } from "@/contracts/api";
import { toMsk } from "@/lib/time";
import { docPublicCode, docTokenHash } from "@/server/services/verify-code";
import * as s from "@db/schema";
import { getDb } from "@/server/db";
import { apiAs, freezeTime, resetDb } from "../helpers/api";
import type { Fixtures } from "../helpers/fixtures";

// DS-23. GET /api/verify/:code — публичная проверка подлинности справки:
//   found: true (typeTitle, issuedAt, valid), found: false на несуществующий код —
//   всегда 200; в ответе нет ФИО и номера заявки; 429 после 30 запросов в минуту на IP.
// Эндпоинт публичный, поэтому тесты идут без сессии (actor guest).
// Коды вычисляем той же формулой, что и сид: PUBLIC_CODE = sha256(`${secret}:${docId}`)

const NOW = "2026-11-12T12:00:00+03:00";

let fx: Fixtures;
beforeAll(async () => {
  freezeTime(NOW);
  fx = await resetDb();
});

const db = () => getDb();

/** Действующий документ из сида популяции с его студентом и номером заявки. */
async function seedIssuedDocument() {
  const [row] = await db()
    .select({
      id: s.documents.id,
      issuedAt: s.documents.issuedAt,
      typeTitle: s.requestTypes.title,
      number: s.requests.number,
      lastName: s.studentProfiles.lastName,
      displayName: s.studentProfiles.displayName,
    })
    .from(s.documents)
    .innerJoin(s.requests, eq(s.requests.id, s.documents.requestId))
    .innerJoin(s.requestTypes, eq(s.requestTypes.code, s.requests.typeCode))
    .innerJoin(s.studentProfiles, eq(s.studentProfiles.userId, s.documents.studentId))
    .where(isNull(s.documents.revokedAt))
    .limit(1);
  expect(row, "сид популяции должен выдавать issued-документы").toBeDefined();
  return row!;
}

/** Отдельный IP, чтобы лимит в 30/мин не задевал другие тесты файла. */
const ipLimit = { "x-real-ip": "203.0.113.77" };
const callWithLimit = () =>
  apiAs("guest").get<VerifyDTO>(`/api/verify/${"f".repeat(64)}`, {
    headers: ipLimit,
  });

describe("GET /api/verify/:code", () => {
  it("код из сида: found: true с типом и датой, без персональных данных", async () => {
    const doc = await seedIssuedDocument();
    const res = await apiAs("guest").get<VerifyDTO>(`/api/verify/${docPublicCode(doc.id)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.body).toEqual({
      found: true,
      typeTitle: doc.typeTitle,
      issuedAt: toMsk(doc.issuedAt),
      valid: true,
    });
    // Без ФИО и номера заявки (SPEC §6.5 п.9): тест на отсутствие фамилии в ответе.
    expect(res.text).not.toContain(doc.lastName);
    expect(res.text).not.toContain(doc.displayName);
    expect(res.text).not.toContain(doc.number);
    expect(res.text).not.toContain(doc.id);
  });

  it("несуществующий и мусорный код: 200 { found: false }, без утечки формата", async () => {
    for (const code of ["f".repeat(64), "0".repeat(32), "not-a-code"]) {
      const res = await apiAs("guest").get<VerifyDTO>(`/api/verify/${code}`);
      expect(res.status, code).toBe(200);
      expect(res.body).toEqual({ found: false });
    }
  });

  it("отозванный документ: found: true, valid: false", async () => {
    const docId = randomUUID();
    const [annaProfile] = await db()
      .select()
      .from(s.studentProfiles)
      .where(eq(s.studentProfiles.userId, fx.users.anna));
    await db()
      .insert(s.documents)
      .values({
        id: docId,
        requestId: fx.requests.anna[0]!,
        studentId: annaProfile!.userId,
        fileKey: `test/${docId}.pdf`,
        verifyTokenHash: docTokenHash(docPublicCode(docId)),
        issuedAt: new Date("2026-11-10T15:00:00+03:00"),
        revokedAt: new Date("2026-11-11T09:00:00+03:00"),
      });
    try {
      const res = await apiAs("guest").get<VerifyDTO>(`/api/verify/${docPublicCode(docId)}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        found: true,
        typeTitle: "Справка об обучении",
        issuedAt: toMsk(new Date("2026-11-10T15:00:00+03:00")),
        valid: false,
      });
      // Анна = «Соколова» (demo-accounts): ФИО владельца документа в ответе нет.
      expect(res.text).not.toContain("Соколова");
      expect(res.text).not.toContain(annaProfile!.displayName);
    } finally {
      await db().delete(s.documents).where(eq(s.documents.id, docId));
    }
  });

  it("после 30 запросов в минуту с одного IP — 429 RATE_LIMITED", async () => {
    // Лимит-IP задан сверху (203.0.113.77): остальные тесты файла ходят с 127.0.0.1.
    for (let i = 0; i < 30; i += 1) {
      const res = await callWithLimit();
      expect(res.status, `запрос ${i + 1}`).toBe(200);
    }
    const rejected = await callWithLimit();
    expect(rejected.status).toBe(429);
    expect(rejected.body).toEqual({ error: { code: "RATE_LIMITED" } });
  });
});
