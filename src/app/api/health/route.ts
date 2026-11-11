// GET /api/health — «пульс» для индикатора сети (SPEC §6.13 п.3): без сессии, без БД и без данных.
// Отвечает сам процесс Next: если ответ дошёл, сервер доступен.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
