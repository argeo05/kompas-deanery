import { z } from "zod";

/** GET /api/me/search?q= — 2–80 символов, лишнее отбрасывается. */
export const searchQuery = z.object({
  q: z.string().trim().min(2).max(80),
});
export type SearchQuery = z.output<typeof searchQuery>;
