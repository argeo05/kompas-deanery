import "server-only";
import path from "node:path";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import QRCode from "qrcode";

// Шаблон PDF справки (SPEC §6.5 п.8, п.12, AC-5.5). Только текст, QR и водяной знак:
// логотипа, печати и подписи вуза нет — документ нельзя принять за настоящий.
// Шрифт Onest (SIL OFL 1.1) вшит в PDF: src/server/pdf/fonts, кириллица и латиница в одном файле.

/** Водяной знак: обязателен на каждой странице (SPEC §6.5 п.8). */
export const WATERMARK_LINES = ["ОБРАЗЕЦ · КОНЦЕПТ", "НЕ ЯВЛЯЕТСЯ ОФИЦИАЛЬНЫМ ДОКУМЕНТОМ"] as const;
export const SIGNATURE_NOTE = "Здесь будет электронная подпись вуза (в концепте не применяется)";

// PDF не читает CSS-переменные, поэтому цвета здесь продублированы из tokens.css (светлая тема).
const INK = "#14213d";
const INK_2 = "#4a5672";
const LINE = "#e2dcd0";
const MARK = "#e2dcd0";
const ACCENT = "#2b44a8";

const fontDir = path.join(process.cwd(), "src/server/pdf/fonts");
Font.register({
  family: "Onest",
  fonts: [
    { src: path.join(fontDir, "Onest-400.ttf"), fontWeight: 400 },
    { src: path.join(fontDir, "Onest-600.ttf"), fontWeight: 600 },
  ],
});
// Без переносов по слогам: у кириллических слов сломанный перенос выглядит как опечатка.
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: { padding: 48, fontFamily: "Onest", fontSize: 11, color: INK, lineHeight: 1.5 },
  brand: { fontSize: 9, color: INK_2, marginBottom: 28 },
  // Высота строки задана явно: lineHeight страницы наследуется в пунктах (11 × 1,5) и крупный текст налезал на соседние строки.
  title: { fontSize: 22, fontWeight: 600, lineHeight: 1.25, marginBottom: 4 },
  meta: { fontSize: 10, color: INK_2, marginBottom: 20 },
  lead: { marginBottom: 14 },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
    paddingVertical: 5,
  },
  label: { width: "42%", color: INK_2 },
  value: { width: "58%" },
  signature: {
    marginTop: 28,
    padding: 10,
    borderWidth: 0.75,
    borderStyle: "dashed",
    borderColor: INK_2,
    color: INK_2,
    fontSize: 10,
  },
  verify: { marginTop: 22, flexDirection: "row", alignItems: "center" },
  qr: { width: 92, height: 92, marginRight: 14 },
  verifyText: { flex: 1, fontSize: 9.5, color: INK_2 },
  link: { color: ACCENT, marginTop: 3, fontSize: 8 },
  mark: {
    position: "absolute",
    top: 330,
    left: -40,
    width: 700,
    textAlign: "center",
    transform: "rotate(-35deg)",
    color: MARK,
  },
  markBig: { fontSize: 42, fontWeight: 600, lineHeight: 1.2 },
  markSmall: { fontSize: 20, fontWeight: 600, lineHeight: 1.3 },
});

export interface DocumentPdfData {
  typeCode: string;
  typeTitle: string;
  requestNumber: string;
  issuedAtLabel: string;
  fullName: string;
  group: string;
  program: string;
  faculty: string;
  course: number;
  /** Подписи и значения полей заявки в порядке формы. */
  fields: { label: string; value: string }[];
  verifyUrl: string;
}

/** Основной абзац по типу справки; для остальных типов — общая формулировка. */
function leadText(d: DocumentPdfData): string {
  const who = `${d.fullName}, группа ${d.group}, ${d.course} курс, направление «${d.program}», факультет «${d.faculty}»`;
  if (d.typeCode === "study_cert")
    return `Настоящая справка подтверждает, что обучающийся ${who}, учится в вузе в текущем учебном году.`;
  return `Документ выдан обучающемуся: ${who}, по заявке ${d.requestNumber}.`;
}

function DocumentPdf({ d, qr }: { d: DocumentPdfData; qr: string }) {
  return (
    <Document title={d.typeTitle} author="Компас (концепт)" subject={WATERMARK_LINES[1]}>
      <Page size="A4" style={styles.page}>
        {/* Водяной знак первым: рисуется под текстом, чтобы не закрывать его */}
        <View style={styles.mark} fixed>
          <Text style={styles.markBig}>{WATERMARK_LINES[0]}</Text>
          <Text style={styles.markSmall}>{WATERMARK_LINES[1]}</Text>
        </View>
        <Text style={styles.brand}>Компас · концепт личного кабинета студента</Text>
        <Text style={styles.title}>{d.typeTitle}</Text>
        <Text style={styles.meta}>
          Заявка {d.requestNumber} · выдана {d.issuedAtLabel}
        </Text>
        <Text style={styles.lead}>{leadText(d)}</Text>
        {d.fields.map((f) => (
          <View key={f.label} style={styles.row} wrap={false}>
            <Text style={styles.label}>{f.label}</Text>
            <Text style={styles.value}>{f.value}</Text>
          </View>
        ))}
        <Text style={styles.signature}>{SIGNATURE_NOTE}</Text>
        <View style={styles.verify} wrap={false}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image из react-pdf: у PDF нет атрибута alt */}
          <Image src={qr} style={styles.qr} />
          <View style={styles.verifyText}>
            <Text>
              Подлинность проверяется по QR-коду или по ссылке. Страница проверки не показывает имя
              владельца.
            </Text>
            <Text style={styles.link}>{d.verifyUrl}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

/** Собирает PDF справки: QR на абсолютную ссылку /verify/<код>. */
export async function renderDocumentPdf(data: DocumentPdfData): Promise<Buffer> {
  const qr = await QRCode.toDataURL(data.verifyUrl, {
    margin: 1,
    width: 276,
    errorCorrectionLevel: "M",
  });
  return renderToBuffer(<DocumentPdf d={data} qr={qr} />);
}
