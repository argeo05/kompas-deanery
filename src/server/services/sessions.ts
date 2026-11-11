import "server-only";
import { now } from "@/lib/clock";
import type { SessionsDTO } from "@/contracts/api";
import { deleteUserSession, deleteUserSessions, listUserSessions } from "../repositories/sessions";

/** Название устройства по User-Agent: «Chrome · Windows». Строка UA наружу не уходит целиком. */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "Неизвестное устройство";
  const ua = userAgent;
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /YaBrowser/.test(ua)
        ? "Яндекс Браузер"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : null;
  const parts = [browser, os].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Неизвестное устройство";
}

export async function listMySessions(userId: string, currentId: string): Promise<SessionsDTO> {
  const rows = await listUserSessions(userId, now());
  return {
    items: rows.map((r) => ({
      id: r.id,
      device: describeDevice(r.userAgent),
      createdAt: r.createdAt.toISOString(),
      lastSeenAt: r.updatedAt.toISOString(),
      current: r.id === currentId,
    })),
  };
}

export const endMySession = deleteUserSession;
export const endAllMySessions = deleteUserSessions;
