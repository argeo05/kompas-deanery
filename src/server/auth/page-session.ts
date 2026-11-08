import "server-only";
import { headers } from "next/headers";
import { getAuth, type AuthSession } from "./index";

// Сессия для серверных компонентов и layout (страницы кабинета). Как и в обработчиках API,
// пользователь берётся только из cookie сессии, а не из адреса страницы или параметров.

export async function getPageSession(): Promise<AuthSession | null> {
  return getAuth().api.getSession({ headers: await headers() });
}
