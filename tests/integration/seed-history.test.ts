import { asc, eq, like } from "drizzle-orm";
import { expect, it } from "vitest";
import { documents, requestEvents, requests, requestTypes, users } from "@db/schema";
import { requestFieldIssues } from "@/server/services/requests";
import { getDb } from "@/server/db";
import { freezeTime } from "../helpers/clock";
import { resetDb } from "../helpers/db";

it.each(["2026-11-18T04:00:00+03:00", "2026-11-22T00:00:00+03:00"])(
  "демо на %s: история каждой заявки и дата выдачи совпадают с её карточкой",
  async (asOf) => {
    freezeTime(asOf);
    await resetDb();
    const db = getDb();
    const [cards, events, issued, types] = await Promise.all([
      db.select().from(requests),
      db.select().from(requestEvents).orderBy(asc(requestEvents.createdAt)),
      db.select().from(documents),
      db.select().from(requestTypes),
    ]);
    expect(cards).toHaveLength(72);
    expect(issued).toHaveLength(15);
    for (const card of cards) {
      const history = events.filter((event) => event.requestId === card.id);
      expect(history[0], card.number).toMatchObject({
        fromStatus: null,
        toStatus: "submitted",
        createdAt: card.createdAt,
      });
      for (let i = 1; i < history.length; i++) {
        const previous = history[i - 1]!;
        const next = history[i]!;
        expect(next.fromStatus, card.number).toBe(previous.toStatus);
        expect(next.createdAt.getTime(), card.number).toBeGreaterThan(previous.createdAt.getTime());
      }
      expect(history.at(-1), card.number).toMatchObject({
        toStatus: card.status,
        createdAt: card.updatedAt,
      });
      expect(card.updatedAt.getTime(), card.number).toBeLessThanOrEqual(Date.parse(asOf));
      if (card.status === "issued") {
        expect(
          issued.filter((doc) => doc.requestId === card.id),
          card.number,
        ).toHaveLength(1);
      }
    }
    for (const doc of issued) {
      const card = cards.find((item) => item.id === doc.requestId)!;
      expect(types.find((type) => type.code === card.typeCode)?.deliveryOptions).toContain(
        card.delivery,
      );
      expect(doc, card.number).toMatchObject({
        studentId: card.studentId,
        issuedAt: card.updatedAt,
      });
      expect(card.status, card.number).toBe("issued");
    }
  },
);

it("фоновые заявки заполнены полями и допустимыми значениями своей формы", async () => {
  const db = getDb();
  await resetDb();
  const items = await db
    .select({ number: requests.number, fields: requests.payload, form: requestTypes.formSchema })
    .from(requests)
    .innerJoin(requestTypes, eq(requests.typeCode, requestTypes.code))
    .innerJoin(users, eq(requests.studentId, users.id))
    .where(like(users.username, "bg.st.%"));
  expect(items).toHaveLength(60);
  for (const { number, fields, form } of items) {
    expect(requestFieldIssues(form, fields), number).toEqual([]);
    for (const field of form.filter((field) => field.required)) {
      expect(String(fields[field.name] ?? "").trim(), number).not.toBe("");
    }
  }
});
