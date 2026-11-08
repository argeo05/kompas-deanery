import { toNextJsHandler } from "better-auth/next-js";
import type { NextRequest } from "next/server";
import { getAuth } from "@/server/auth";

// Маршруты Better Auth: POST /api/auth/sign-in/username, /api/auth/sign-out, GET /api/auth/get-session …
// Регистрация отключена (disableSignUp). Лимиты частоты — в src/server/auth/index.ts.
export function GET(req: NextRequest) {
  return toNextJsHandler(getAuth()).GET(req);
}

export function POST(req: NextRequest) {
  return toNextJsHandler(getAuth()).POST(req);
}
