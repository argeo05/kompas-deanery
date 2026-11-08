import { expect, test } from "@playwright/test";
import { notImplementedRoutes } from "../security/not-implemented";

// Нереализованные маршруты отвечают 404, а не 405/500 и не «заглушкой» (C1, tests/security/not-implemented.ts).
for (const { method, path } of notImplementedRoutes) {
  test(`${method} ${path}: 404`, async ({ request, baseURL }) => {
    const res = await request.fetch(path, {
      method,
      data: {},
      headers: { origin: baseURL! },
    });
    expect(res.status()).toBe(404);
  });
}
