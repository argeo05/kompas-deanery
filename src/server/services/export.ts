import "server-only";
import type { Tx } from "../db";
import { deadlinesListQuery } from "../schemas/deadlines";
import { gradesQuery } from "../schemas/grades";
import { notificationsListQuery } from "../schemas/notifications";
import { requestsListQuery } from "../schemas/requests";
import { listMyDeadlines } from "./deadlines";
import { listMyDocuments } from "./documents";
import { semesterGrades } from "./grades";
import { getMyProfile } from "./me";
import { getMyPrefsDTO, listMyNotifications } from "./notifications";
import { listMyRequests } from "./requests";
import { listMyTickets } from "./tickets";
import { now } from "@/lib/clock";

// «Скачать мои данные» (SPEC §6.11 п.5): всё личное, что Компас хранит о студенте, одним JSON.
// Собирается теми же сервисами, что и экраны, — значит, с теми же условиями по владельцу.

export async function exportMyData(tx: Tx, studentId: string) {
  return {
    exportedAt: now().toISOString(),
    note: "Все данные вымышленные: Компас — концепт для конкурса.",
    profile: await getMyProfile(tx, studentId),
    requests: await listMyRequests(tx, studentId, requestsListQuery.parse({ limit: 50 })),
    documents: await listMyDocuments(tx, studentId),
    tickets: await listMyTickets(tx, studentId),
    deadlines: await listMyDeadlines(tx, studentId, deadlinesListQuery.parse({})),
    grades: await semesterGrades(tx, studentId, gradesQuery.parse({})),
    notifications: await listMyNotifications(tx, studentId, notificationsListQuery.parse({})),
    notificationSettings: await getMyPrefsDTO(tx, studentId),
  };
}
