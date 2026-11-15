import { expect, type BrowserContext } from "@playwright/test";
import type { NotificationPrefsDTO } from "../../../src/contracts/api";

// Тихие часы студента (по умолчанию 23:00–07:00) откладывают срочное уведомление до 07:00,
// а лента /api/me/notifications показывает только то, что уже доставлено. Ночной прогон e2e
// поэтому не видел уведомление о переносе и о «Важном» объявлении (C10). Поведение продукта
// не трогаем: тест явно выключает тихие часы студенту (from = to — пустой интервал, src/lib/digest.ts)
// прямо перед действием сотрудника. Обратно не возвращаем: тот же студент нужен параллельному
// проекту, а возврат посреди его сценария снова прятал бы уведомление. Демо-данные чистит пересев.
export async function disableQuietHours(student: BrowserContext, baseURL: string): Promise<void> {
  const prefs = (await (
    await student.request.get("/api/me/notification-prefs")
  ).json()) as NotificationPrefsDTO;
  if (prefs.quietFrom === prefs.quietTo) return;
  const res = await student.request.put("/api/me/notification-prefs", {
    data: { ...prefs, quietFrom: 0, quietTo: 0 },
    headers: { origin: baseURL },
  });
  expect(res.status(), await res.text()).toBe(200);
}
