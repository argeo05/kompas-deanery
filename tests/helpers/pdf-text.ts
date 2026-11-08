import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

// Текст и число картинок PDF для проверок содержимого (AC-5.5). Только в тестах.
export async function pdfText(bytes: Uint8Array): Promise<{ text: string; images: number }> {
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  let text = "";
  let images = 0;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    text += content.items.map((i) => ("str" in i ? i.str : "")).join(" ") + "\n";
    const ops = await page.getOperatorList();
    images += ops.fnArray.filter(
      (f) => f === OPS.paintImageXObject || f === OPS.paintInlineImageXObject,
    ).length;
  }
  return { text: text.replace(/\s+/g, " "), images };
}
