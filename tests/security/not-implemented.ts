import type { Method } from "./manifest";

// Маршруты из SPEC, которых в приложении ещё нет (SPEC §9.7). Они не «пропущены»: сервер обязан
// отвечать на них 404 (проверка в tests/e2e/not-implemented.spec.ts, а наличие route.ts — в idor.spec.ts).
// Реализовал маршрут → перенеси запись в manifest.ts с case-фабрикой и проверками изоляции.
export const notImplementedRoutes: { method: Method; path: string; ticket: string }[] = [
  // Помощник за фича-флагом, этап C9.
  { method: "POST", path: "/api/assistant", ticket: "C9" },
  // Сброс демо-данных для жюри, этап C8.
  { method: "POST", path: "/api/jury/reset", ticket: "C8" },
];
