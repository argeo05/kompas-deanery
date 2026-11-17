// Ссылка на доказательство: путь к коду или тесту в репозитории. Адрес репозитория в сопроводительном PDF.
export function Proof({ label = "Проверка", files }: { label?: string; files: string[] }) {
  return (
    <p className="type-caption text-ink-2">
      {label}:{" "}
      {files.map((f, i) => (
        <span key={f}>
          {i > 0 && ", "}
          <code className="font-mono break-all">{f}</code>
        </span>
      ))}
    </p>
  );
}
