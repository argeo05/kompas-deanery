import "server-only";
import { asc } from "drizzle-orm";
import type { RequestTypeDTO, RequestTypesDTO } from "@/contracts/api";
import type { Tx } from "../db";
import { requestTypes } from "../../../db/schema";

// Каталог справок (DS-16). Таблица справочная (не личная), но читается внутри withUserTx
// по образцу эталонного эндпоинта — только для студентов.

export async function listRequestTypes(tx: Tx): Promise<RequestTypesDTO> {
  const rows = await tx.select().from(requestTypes).orderBy(asc(requestTypes.sortOrder));
  const items: RequestTypeDTO[] = rows.map((t) => ({
    code: t.code,
    title: t.title,
    hint: t.hint,
    synonyms: t.synonyms,
    slaDays: t.slaDays,
    delivery: t.deliveryOptions,
    popular: t.popular,
    formSchema: t.formSchema,
  }));
  return { items };
}
