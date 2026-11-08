import "server-only";
import type { SessionDTO, UUID } from "@/contracts/api";
import { toMsk, toMskDate } from "@/lib/time";
import type { Tx } from "../db";
import { listExamsForStudentGroup } from "../repositories/session";

// Сервис сессии (DS-14): собирает SessionDTO из строк репозитория.

/** GET /api/me/session — экзамены и зачёты группы студента по датам, с допуском. */
export async function getMySession(
  tx: Tx,
  studentId: string,
  groupId: string,
): Promise<SessionDTO> {
  const rows = await listExamsForStudentGroup(tx, groupId, studentId);
  const items = rows.map(({ exam, courseTitle, room, admission }) => ({
    id: exam.id as UUID,
    courseTitle,
    type: exam.type,
    startsAt: toMsk(exam.startsAt),
    room: `${room.building}-${room.number}`,
    consultationAt: exam.consultationAt ? toMsk(exam.consultationAt) : null,
    admitted: admission?.admitted ?? null,
    admissionReason: admission?.reason ?? null,
  }));
  const first = items.at(0);
  const last = items.at(-1);
  return {
    startsOn: first ? toMskDate(first.startsAt) : null,
    endsOn: last ? toMskDate(last.startsAt) : null,
    items,
  };
}
