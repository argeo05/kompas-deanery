import type { RequestAction, RequestStatus } from "@/contracts/api";

// DS-06. Конечный автомат заявки (схема статусов SPEC §6.5). Тесты: tests/unit/request-fsm.test.ts.
// Разрешены ровно переходы из TRANSITIONS; всё остальное — запрет (в API это 409 CONFLICT).

export type { RequestAction, RequestStatus };
export type Actor = "student" | "staff";

/** Недопустимый переход статуса. Обработчик API переводит его в 409 CONFLICT. */
export class InvalidTransitionError extends Error {
  constructor(
    readonly from: RequestStatus,
    readonly action: RequestAction,
  ) {
    super(`Недопустимый переход заявки: ${from} → ${action}`);
    this.name = "InvalidTransitionError";
  }
}

/** Правила: из какого статуса, какое действие, кто, в какой статус. */
const TRANSITIONS: ReadonlyArray<{
  from: RequestStatus;
  action: RequestAction;
  actor: Actor;
  to: RequestStatus;
}> = [
  { from: "submitted", action: "take", actor: "staff", to: "in_progress" },
  { from: "submitted", action: "reject", actor: "staff", to: "rejected" },
  { from: "submitted", action: "cancel", actor: "student", to: "cancelled" },
  { from: "in_progress", action: "need_info", actor: "staff", to: "needs_info" },
  { from: "in_progress", action: "ready", actor: "staff", to: "ready" },
  { from: "in_progress", action: "reject", actor: "staff", to: "rejected" },
  { from: "needs_info", action: "student_reply", actor: "student", to: "in_progress" },
  { from: "ready", action: "issue", actor: "staff", to: "issued" },
];

/** Можно ли этому участнику выполнить действие из статуса. */
export function canTransition(from: RequestStatus, action: RequestAction, actor: Actor): boolean {
  return TRANSITIONS.some((t) => t.from === from && t.action === action && t.actor === actor);
}

/** Статус после действия по любому участнику (актора проверяет canTransition). Недопустимый — InvalidTransitionError. */
export function nextStatus(from: RequestStatus, action: RequestAction): RequestStatus {
  const transition = TRANSITIONS.find((t) => t.from === from && t.action === action);
  if (!transition) throw new InvalidTransitionError(from, action);
  return transition.to;
}
