// Запрос с JSON-телом из клиентских экранов. Idempotency-Key всегда новый на попытку: сервер,
// которому ключ не нужен, его игнорирует, а там, где нужен, повтор после обрыва не создаст дубль.
export function sendJson(
  method: "POST" | "PUT" | "DELETE",
  url: string,
  body?: unknown,
  idempotencyKey: string = crypto.randomUUID(),
): Promise<Response> {
  return fetch(url, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      "idempotency-key": idempotencyKey,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
