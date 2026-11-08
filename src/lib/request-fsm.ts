import type { RequestAction, RequestStatus } from "@/contracts/api";
import { notImplemented } from "./not-implemented";

// DS-06. Конечный автомат заявки (схема статусов SPEC §6.5). Тесты: tests/unit/request-fsm.test.ts.

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

/** Можно ли этому участнику выполнить действие из статуса. */
export function canTransition(from: RequestStatus, action: RequestAction, actor: Actor): boolean {
  return notImplemented("DS-06", from, action, actor);
}

/** Статус после действия. Недопустимый переход — InvalidTransitionError. */
export function nextStatus(from: RequestStatus, action: RequestAction): RequestStatus {
  return notImplemented("DS-06", from, action);
}
