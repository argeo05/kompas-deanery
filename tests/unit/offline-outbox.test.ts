import { describe, expect, it } from "vitest";
import { enqueue, flush, memoryStorage, type OutboxItem, type SendFn } from "@/lib/offline/outbox";
import { isDocumentFileUrl, isPersistable } from "@/lib/offline/policy";
import { formatUpdatedAgo } from "@/lib/format";

// Очередь офлайн-действий (SPEC §6.13 п.4, AC-13.3, D-014): порядок, «ровно один раз», конфликты.

let n = 0;
function item(over: Partial<OutboxItem> = {}): OutboxItem {
  n += 1;
  return {
    id: `key-${String(n).padStart(4, "0")}`,
    userId: "anna",
    kind: "request.create",
    method: "POST",
    url: "/api/me/requests",
    body: { typeCode: "study-cert" },
    label: "Справка об обучении",
    createdAt: 1_000 + n,
    attempts: 0,
    state: "pending",
    ...over,
  };
}

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Сервер с идемпотентностью: повтор с тем же ключом не создаёт вторую запись. */
function idempotentServer() {
  const created = new Map<string, number>();
  const send: SendFn = async (i) => {
    created.set(i.id, (created.get(i.id) ?? 0) + 1);
    return json(201, { id: i.id });
  };
  return { created, send };
}

describe("flush", () => {
  it("отправляет по порядку создания и убирает отправленное", async () => {
    const a = item();
    const b = item();
    const storage = memoryStorage([b, a]);
    const order: string[] = [];
    const result = await flush(storage, "anna", async (i) => {
      order.push(i.id);
      return json(201);
    });
    expect(order).toEqual([a.id, b.id]);
    expect(result.sent.map((i) => i.id)).toEqual([a.id, b.id]);
    expect(storage.items.size).toBe(0);
  });

  it("каждый запрос несёт свой Idempotency-Key = id элемента; повторный flush ничего не шлёт", async () => {
    const storage = memoryStorage([item(), item()]);
    const server = idempotentServer();
    await flush(storage, "anna", server.send);
    await flush(storage, "anna", server.send);
    expect([...server.created.values()]).toEqual([1, 1]);
  });

  it("нет сети: элемент остаётся, попытка учтена, очередь останавливается", async () => {
    const a = item();
    const b = item();
    const storage = memoryStorage([a, b]);
    let calls = 0;
    const result = await flush(storage, "anna", async () => {
      calls += 1;
      throw new TypeError("Failed to fetch");
    });
    expect(calls).toBe(1);
    expect(result.stopped).toBe("network");
    expect(storage.items.get(a.id)).toMatchObject({ state: "pending", attempts: 1 });
    expect(storage.items.get(b.id)).toMatchObject({ state: "pending", attempts: 0 });
  });

  it("обрыв после того, как сервер принял: повтор с тем же ключом не создаёт дубль", async () => {
    const a = item();
    const storage = memoryStorage([a]);
    const server = idempotentServer();
    // Первая попытка дошла до сервера, но ответ потерялся.
    await flush(storage, "anna", async (i) => {
      await server.send(i);
      throw new TypeError("network lost");
    });
    expect(storage.items.has(a.id)).toBe(true);
    await flush(storage, "anna", async (i) => {
      const res = await server.send(i);
      return server.created.get(i.id)! > 1 ? json(201, { replayed: true }) : res;
    });
    expect(storage.items.size).toBe(0);
    // Сервер видел ключ дважды, но запись по ключу одна: это и есть «ровно один раз».
    expect(server.created.size).toBe(1);
  });

  it("5xx, 429 и 409 IN_PROGRESS — повторить позже; 401 — ждать входа", async () => {
    for (const [status, body, stopped] of [
      [503, {}, "retry"],
      [429, {}, "retry"],
      [409, { error: { code: "CONFLICT", details: { reason: "IN_PROGRESS" } } }, "retry"],
      [401, { error: { code: "UNAUTHORIZED" } }, "auth"],
    ] as const) {
      const a = item();
      const storage = memoryStorage([a]);
      const result = await flush(storage, "anna", async () => json(status, body));
      expect(result.stopped, String(status)).toBe(stopped);
      expect(storage.items.get(a.id)?.state, String(status)).toBe("pending");
    }
  });

  it("данные не подошли (422) или заявки нет (404) — «Не отправлено» с причиной, очередь идёт дальше", async () => {
    const bad = item();
    const gone = item({ kind: "request.message", url: "/api/me/requests/x/messages" });
    const ok = item();
    const storage = memoryStorage([bad, gone, ok]);
    const statuses = new Map([
      [bad.id, 422],
      [gone.id, 404],
      [ok.id, 201],
    ]);
    const result = await flush(storage, "anna", async (i) => json(statuses.get(i.id)!));
    expect(result.failed.map((i) => i.id)).toEqual([bad.id, gone.id]);
    expect(storage.items.get(bad.id)).toMatchObject({ state: "failed" });
    expect(storage.items.get(bad.id)?.error).toMatch(/проверьте поля/);
    expect(storage.items.get(gone.id)?.error).toMatch(/недоступна/);
    expect(storage.items.has(ok.id)).toBe(false);
    // «Не отправлено» вслепую не повторяется.
    let calls = 0;
    await flush(storage, "anna", async () => {
      calls += 1;
      return json(201);
    });
    expect(calls).toBe(0);
  });

  it("отправляет только действия того, кто вошёл", async () => {
    const mine = item();
    const foreign = item({ userId: "maxim" });
    const storage = memoryStorage([mine, foreign]);
    const sent: string[] = [];
    await flush(storage, "anna", async (i) => {
      sent.push(i.userId);
      return json(201);
    });
    expect(sent).toEqual(["anna"]);
    expect(storage.items.has(foreign.id)).toBe(true);
  });
});

describe("enqueue", () => {
  it("«Сделал» и сразу «Вернуть в работу» без сети гасят друг друга", async () => {
    const storage = memoryStorage();
    const done = item({ kind: "deadline.done", url: "/api/me/deadlines/d1/done", target: "d1" });
    await enqueue(storage, done);
    const undone = item({
      kind: "deadline.undone",
      url: "/api/me/deadlines/d1/undone",
      target: "d1",
    });
    expect(await enqueue(storage, undone)).toBeNull();
    expect(storage.items.size).toBe(0);
  });

  it("повторное «Сделал» по тому же дедлайну не дублируется", async () => {
    const storage = memoryStorage();
    const first = item({ kind: "deadline.done", target: "d2" });
    await enqueue(storage, first);
    const again = await enqueue(storage, item({ kind: "deadline.done", target: "d2" }));
    expect(again?.id).toBe(first.id);
    expect(storage.items.size).toBe(1);
  });

  it("заявки не схлопываются: две заявки — два элемента", async () => {
    const storage = memoryStorage();
    await enqueue(storage, item());
    await enqueue(storage, item());
    expect(storage.items.size).toBe(2);
  });
});

describe("policy", () => {
  it("на устройстве — данные студента; поиск, ICS и кабинет сотрудника — нет", () => {
    for (const url of [
      "/api/me/today",
      "/api/me/schedule?from=2026-11-09&to=2026-11-15",
      "/api/me/grades",
      "/api/me/requests?tab=active&limit=50",
      "/api/me/requests/0f8fad5b-d9cb-469f-a165-70867728950e",
      "/api/me/documents",
      "/api/me/notifications?tab=all&limit=20",
    ])
      expect(isPersistable(url), url).toBe(true);
    for (const url of [
      "/api/me/search?q=справка",
      "/api/me/ics",
      "/api/staff/requests",
      "/api/staff/reference",
      "/api/verify/abc",
    ])
      expect(isPersistable(url), url).toBe(false);
  });

  it("PDF справки узнаётся только по точному адресу", () => {
    expect(isDocumentFileUrl("/api/me/documents/0f8fad5b-d9cb-469f-a165-70867728950e/file")).toBe(
      true,
    );
    expect(isDocumentFileUrl("/api/me/documents")).toBe(false);
    expect(isDocumentFileUrl("/api/me/documents/../today/file")).toBe(false);
  });
});

describe("formatUpdatedAgo", () => {
  const now = new Date("2026-11-12T10:00:00+03:00");
  it("по-человечески, по Москве", () => {
    expect(formatUpdatedAgo(now.getTime() - 20_000, now)).toBe("обновлено только что");
    expect(formatUpdatedAgo(now.getTime() - 12 * 60_000, now)).toBe("обновлено 12 мин назад");
    expect(formatUpdatedAgo(new Date("2026-11-12T08:14:00+03:00"), now)).toBe(
      "обновлено сегодня в 08:14",
    );
    expect(formatUpdatedAgo(new Date("2026-11-11T19:05:00+03:00"), now)).toBe(
      "обновлено вчера в 19:05",
    );
  });
});
