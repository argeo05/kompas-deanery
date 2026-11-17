// Словарь синонимов поиска (SPEC §6.10 п.3). Ключ — разговорное слово, значение — слова, по которым
// ищем в справочнике, дисциплинах и заявках. Сравнение без регистра и без «ё».

export const SYNONYMS: Record<string, string[]> = {
  военкомат: ["военкомат", "воинский учёт", "форма 26"],
  академ: ["академический отпуск"],
  стипуха: ["стипендия"],
  общага: ["общежитие"],
  хвост: ["пересдача", "задолженность"],
  допса: ["пересдача"],
  препод: ["преподаватель"],
  физра: ["физическая культура"],
  макро: ["макроэкономика"],
  микро: ["микроэкономика"],
  вышмат: ["математика"],
  больничный: ["болезнь", "справка"],
  деканат: ["обращение", "связь с деканатом"],
};

export function normalizeQuery(q: string): string {
  return q.toLowerCase().replaceAll("ё", "е").replace(/\s+/g, " ").trim();
}

/** Запрос и его расширения (без дублей, нормализованные). */
export function expandQuery(q: string): string[] {
  const base = normalizeQuery(q);
  const out = new Set<string>([base]);
  for (const word of base.split(" ")) {
    for (const [key, values] of Object.entries(SYNONYMS)) {
      if (normalizeQuery(key) === word) for (const v of values) out.add(normalizeQuery(v));
    }
  }
  return [...out];
}
