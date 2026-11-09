import { z } from "zod";
import type { FormFieldSchema } from "@/contracts/api";

// Форма заявки строится из formSchema типа, которую отдаёт сервер (GET /api/request-types):
// набор полей, обязательность, длины и варианты выбора живут в одном месте. Здесь они превращаются
// в схему Zod для проверки до отправки. Сервер всё равно проверяет заново (SPEC §6.5).

export type FormValues = Record<string, string>;

/** Схема одного поля. Значения в форме всегда строки; числа превращает toFields. */
function fieldSchema(f: FormFieldSchema): z.ZodType<string> {
  const empty = "Заполните это поле";
  if (f.kind === "select") {
    const options = f.options ?? [];
    const base = z
      .string()
      .refine((v) => v === "" || options.includes(v), "Выберите вариант из списка");
    return f.required ? base.refine((v) => v !== "", "Выберите вариант") : base;
  }
  if (f.kind === "number") {
    const base = z
      .string()
      .trim()
      .refine(
        (v) => {
          if (v === "") return true;
          const n = Number(v.replace(",", "."));
          return (
            Number.isFinite(n) &&
            (f.min === undefined || n >= f.min) &&
            (f.max === undefined || n <= f.max)
          );
        },
        f.min !== undefined && f.max !== undefined
          ? `Введите число от ${f.min} до ${f.max}`
          : "Введите число",
      );
    return f.required ? base.refine((v) => v !== "", empty) : base;
  }
  let s = z.string().trim();
  if (f.max !== undefined) s = s.max(f.max, `Не больше ${f.max} символов`);
  if (f.min !== undefined) s = s.min(f.min, `Не меньше ${f.min} символов`);
  return f.required ? s.refine((v) => v !== "", empty) : s;
}

/** Схема формы типа: ключи — name полей. */
export function buildFormSchema(fields: FormFieldSchema[]) {
  return z.object(Object.fromEntries(fields.map((f) => [f.name, fieldSchema(f)])));
}

/** Ошибки по полям: name → текст. Пустой объект — всё верно. */
export function validateForm(
  fields: FormFieldSchema[],
  values: FormValues,
): Record<string, string> {
  const parsed = buildFormSchema(fields).safeParse(
    Object.fromEntries(fields.map((f) => [f.name, values[f.name] ?? ""])),
  );
  if (parsed.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const name = String(issue.path[0]);
    errors[name] ??= issue.message;
  }
  return errors;
}

/** Значения для API: пустые поля не отправляем, числа — числом. */
export function toFields(
  fields: FormFieldSchema[],
  values: FormValues,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const f of fields) {
    const raw = (values[f.name] ?? "").trim();
    if (raw === "") continue;
    out[f.name] = f.kind === "number" ? Number(raw.replace(",", ".")) : raw;
  }
  return out;
}

/** Значения формы из полей существующей заявки (подать заново). */
export function fromFields(
  fields: FormFieldSchema[],
  saved: Record<string, string | number>,
): FormValues {
  return Object.fromEntries(
    fields.map((f) => [f.name, saved[f.name] === undefined ? "" : String(saved[f.name])]),
  );
}

// ── Черновик в localStorage ─────────────────────────────────────────────────
// Хранилище может быть закрыто (приватное окно, запрет сайта): тогда черновика просто нет.
// Ключ включает id студента: на общем устройстве чужой черновик не подставится.

export interface Draft {
  values: FormValues;
  delivery: string | null;
  copies: number;
}

const draftKey = (userId: string, typeCode: string) => `kompas:draft:v1:${userId}:${typeCode}`;

export function loadDraft(userId: string, typeCode: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(userId, typeCode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (typeof parsed.values !== "object" || parsed.values === null) return null;
    return {
      values: Object.fromEntries(
        Object.entries(parsed.values).filter(([, v]) => typeof v === "string"),
      ),
      delivery: typeof parsed.delivery === "string" ? parsed.delivery : null,
      copies: typeof parsed.copies === "number" ? parsed.copies : 1,
    };
  } catch {
    return null;
  }
}

export function saveDraft(userId: string, typeCode: string, draft: Draft): void {
  try {
    window.localStorage.setItem(draftKey(userId, typeCode), JSON.stringify(draft));
  } catch {
    // Черновик не сохранится — форма работает как обычно.
  }
}

export function clearDraft(userId: string, typeCode: string): void {
  try {
    window.localStorage.removeItem(draftKey(userId, typeCode));
  } catch {
    // Нечего чистить.
  }
}
