import { mskParts } from "./time";

/** Номер заявки «СП-ГГММ-NNNN» (SPEC §6.5 п.3): год и месяц подачи по Москве + порядковый номер из БД. */
export function formatRequestNumber(createdAt: Date, seq: number): string {
  const p = mskParts(createdAt);
  const yymm = `${String(p.year % 100).padStart(2, "0")}${String(p.month).padStart(2, "0")}`;
  return `СП-${yymm}-${String(seq).padStart(4, "0")}`;
}
