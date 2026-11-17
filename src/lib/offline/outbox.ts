// Очередь офлайн-действий (SPEC §6.13 п.4, AC-13.3, D-014): чистая логика без браузерных API,
// хранилище и отправка передаются снаружи (страница — IndexedDB + fetch, тесты — память).
//
// Правила:
// • id элемента = Idempotency-Key запроса. Повтор после обрыва сервер не превратит во вторую заявку;
// • элементы уходят по одному в порядке создания и только от имени того, кто их создал (userId);
// • сеть пропала, 5xx, 429, 409 IN_PROGRESS → элемент ждёт следующей попытки, очередь останавливается;
// • 401 → ждём входа, ничего не теряем;
// • прочие 4xx (данные не подошли, заявка исчезла) → «Не отправлено» с понятной причиной: элемент
//   не повторяется вслепую, человек решает сам (удалить, открыть заново);
// • противоположные отметки одного объекта схлопываются: «сделал» и сразу «не сделал» офлайн = ничего.

export type OutboxKind =
  "request.create" | "request.resubmit" | "request.message" | "deadline.done" | "deadline.undone";

export interface OutboxItem {
  /** Он же Idempotency-Key. */
  id: string;
  userId: string;
  kind: OutboxKind;
  method: "POST";
  url: string;
  body?: unknown;
  /** Что показать человеку: «Справка об обучении», текст ответа. */
  label: string;
  /** К чему относится действие (id заявки, дедлайна): для схлопывания и показа в карточке. */
  target?: string;
  createdAt: number;
  attempts: number;
  state: "pending" | "failed";
  /** Почему не отправилось (для state = failed). */
  error?: string;
}

export interface OutboxStorage {
  all(): Promise<OutboxItem[]>;
  put(item: OutboxItem): Promise<void>;
  remove(id: string): Promise<void>;
}

export type SendFn = (item: OutboxItem) => Promise<Response>;

export interface FlushResult {
  sent: OutboxItem[];
  failed: OutboxItem[];
  /** Почему очередь остановилась раньше конца. */
  stopped?: "network" | "auth" | "retry";
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * Куда может уйти действие каждого вида. Очередь лежит в IndexedDB, а оттуда запрос уходит с cookie:
 * подложенная запись не должна отправить POST на произвольный адрес (например, кабинета сотрудника).
 */
const ALLOWED_URL: Record<OutboxKind, RegExp> = {
  "request.create": /^\/api\/me\/requests$/,
  "request.resubmit": new RegExp(`^/api/me/requests/${UUID}/resubmit$`, "i"),
  "request.message": new RegExp(`^/api/me/requests/${UUID}/messages$`, "i"),
  "deadline.done": new RegExp(`^/api/me/deadlines/${UUID}/done$`, "i"),
  "deadline.undone": new RegExp(`^/api/me/deadlines/${UUID}/undone$`, "i"),
};

export function isAllowedOutboxUrl(kind: OutboxKind, url: string): boolean {
  const re = ALLOWED_URL[kind];
  return re !== undefined && re.test(url);
}

const OPPOSITE: Partial<Record<OutboxKind, OutboxKind>> = {
  "deadline.done": "deadline.undone",
  "deadline.undone": "deadline.done",
};

export function byCreation(a: OutboxItem, b: OutboxItem) {
  return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}

/** Добавить действие. Возвращает то, что осталось в очереди по этому действию (null — схлопнулось). */
export async function enqueue(
  storage: OutboxStorage,
  item: OutboxItem,
): Promise<OutboxItem | null> {
  const opposite = OPPOSITE[item.kind];
  if (item.target && opposite) {
    const items = await storage.all();
    const same = items.filter(
      (i) => i.userId === item.userId && i.target === item.target && i.state === "pending",
    );
    const twin = same.find((i) => i.kind === opposite);
    if (twin) {
      await storage.remove(twin.id);
      return null;
    }
    const dup = same.find((i) => i.kind === item.kind);
    if (dup) return dup;
  }
  await storage.put(item);
  return item;
}

/** Текст причины для «Не отправлено» по ответу сервера. */
export function failureText(kind: OutboxKind, status: number): string {
  if (status === 404)
    return kind.startsWith("deadline")
      ? "Этого дедлайна больше нет. Обновите список, чтобы убрать отметку."
      : "Заявка больше недоступна. Откройте список заявок.";
  if (status === 409)
    return kind === "request.resubmit"
      ? "Эта заявка уже отправлена."
      : "Пока вы были без сети, заявка изменилась. Откройте её и проверьте.";
  return kind.startsWith("request")
    ? "Часть данных не подошла. Удалите это действие, откройте форму, проверьте поля и отправьте заново."
    : "Не получилось сохранить отметку. Удалите её и отметьте дедлайн снова.";
}

async function reasonOf(res: Response): Promise<string | null> {
  try {
    const body = (await res.clone().json()) as { error?: { details?: { reason?: string } } };
    return body?.error?.details?.reason ?? null;
  } catch {
    return null;
  }
}

/** Отправить ожидающие действия пользователя по порядку. */
export async function flush(
  storage: OutboxStorage,
  userId: string,
  send: SendFn,
): Promise<FlushResult> {
  const result: FlushResult = { sent: [], failed: [] };
  const queue = (await storage.all())
    .filter((i) => i.userId === userId && i.state === "pending")
    .sort(byCreation);

  for (const item of queue) {
    if (item.method !== "POST" || !isAllowedOutboxUrl(item.kind, item.url)) {
      // Такого действия Компас не создаёт: не отправляем и убираем.
      await storage.remove(item.id);
      continue;
    }
    let res: Response;
    try {
      res = await send(item);
    } catch {
      await storage.put({ ...item, attempts: item.attempts + 1 });
      result.stopped = "network";
      return result;
    }
    if (res.ok) {
      await storage.remove(item.id);
      result.sent.push(item);
      continue;
    }
    if (res.status === 401) {
      result.stopped = "auth";
      return result;
    }
    const retryLater =
      res.status >= 500 ||
      res.status === 429 ||
      (res.status === 409 && (await reasonOf(res)) === "IN_PROGRESS");
    if (retryLater) {
      await storage.put({ ...item, attempts: item.attempts + 1 });
      result.stopped = "retry";
      return result;
    }
    const failed: OutboxItem = {
      ...item,
      attempts: item.attempts + 1,
      state: "failed",
      error: failureText(item.kind, res.status),
    };
    await storage.put(failed);
    result.failed.push(failed);
  }
  return result;
}

/** Хранилище в памяти: для тестов и как запасной вариант без IndexedDB. */
export function memoryStorage(
  initial: OutboxItem[] = [],
): OutboxStorage & { items: Map<string, OutboxItem> } {
  const items = new Map(initial.map((i) => [i.id, i]));
  return {
    items,
    all: async () => [...items.values()],
    put: async (i) => void items.set(i.id, i),
    remove: async (id) => void items.delete(id),
  };
}
