import { RateLimiterMemory } from "rate-limiter-flexible";
import { z } from "zod";
import { requireStudent } from "@/server/auth/guards";
import { withUserTx } from "@/server/db";
import { HttpError, notFound, route } from "@/server/http";
import { renderMyDocument } from "@/server/services/documents";

// Скачивание PDF справки (SPEC §6.5, AC-5.3, AC-5.5). Документ ищется по id и владельцу из сессии:
// чужой, отозванный и несуществующий одинаково дают 404. PDF строится из данных заявки при запросе.

const idParam = z.uuid();

// Лимит сборки PDF: рендер дорогой, а скачивать один и тот же файл чаще раза в несколько секунд незачем.
const pdfLimiter = new RateLimiterMemory({ points: 20, duration: 60 });

/** Адрес сайта для QR. В production только из настроек: заголовок Host подделывается клиентом. */
function appOrigin(req: Request): string {
  const configured = process.env.BETTER_AUTH_URL;
  if (configured) return new URL(configured).origin;
  if (process.env.NODE_ENV === "production") throw new Error("BETTER_AUTH_URL не задан");
  return new URL(req.url).origin;
}

/** GET /api/me/documents/:id/file → 200 application/pdf (attachment). */
export const GET = route<{ id: string }>(async (req, { params }) => {
  const me = await requireStudent(req);
  try {
    await pdfLimiter.consume(me.userId);
  } catch {
    throw new HttpError(429, "RATE_LIMITED");
  }
  const id = idParam.safeParse((await params).id);
  if (!id.success) notFound();
  // Адрес сайта для QR: из настроек развёртывания, а не из заголовков запроса (за прокси хост внутренний).
  const origin = appOrigin(req);
  const file = await withUserTx(me.userId, (tx) =>
    renderMyDocument(tx, me.studentId, id.data, origin),
  );
  if (!file) notFound();
  return new Response(new Uint8Array(file.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
