import "server-only";
import type { NavBadges } from "@/components/shell/nav";
import { now } from "@/lib/clock";
import { addDaysMsk, mskParts, toMskDate } from "@/lib/time";
import type { Tx } from "../db";
import type { StudentCtx } from "../auth/guards";
import { unreadCounts } from "../repositories/notifications";
import { listMyDeadlines } from "./deadlines";
import { getMyProfile } from "./me";
import { listMyRequests } from "./requests";
import { getMySchedule } from "./schedule";

// Данные оболочки кабинета студента (SPEC §5.2): инициалы для аватара и бейджи навигации.
// Бейджи считаются из тех же сервисов, что и API, — расхождения между числом и экраном не будет.

export interface StudentShellData {
  displayName: string;
  initials: string;
  badges: NavBadges;
}

const initialOf = (value: string | undefined) => (value ?? "").trim().charAt(0).toUpperCase();

export async function getStudentShell(tx: Tx, ctx: StudentCtx): Promise<StudentShellData> {
  const at = now();
  const { weekday } = mskParts(at);
  const monday = addDaysMsk(at, -(weekday - 1));
  const range = { from: toMskDate(monday), to: toMskDate(addDaysMsk(monday, 6)) };

  const [profile, unread, deadlines, requests, week] = await Promise.all([
    getMyProfile(tx, ctx.studentId),
    unreadCounts(tx, ctx.userId, at),
    listMyDeadlines(tx, ctx.studentId, { status: "active" }),
    listMyRequests(tx, ctx.studentId, { tab: "active", limit: 50 }),
    getMySchedule(tx, { studentId: ctx.studentId, groupId: ctx.groupId }, range),
  ]);

  const notifications = unread.urgent + unread.personal + unread.info;
  const hot = deadlines.groups.hot.length;
  return {
    displayName: profile?.displayName ?? "",
    initials:
      initialOf(profile?.fullName.first) + initialOf(profile?.fullName.last) ||
      initialOf(profile?.displayName),
    badges: {
      schedule: week.classes.some((c) => c.change !== null),
      study: hot,
      requests: requests.items.some((r) => r.unseen),
      more: notifications,
      notifications,
    },
  };
}
