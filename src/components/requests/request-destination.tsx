export function RequestDestination({ value }: { value: string | number | undefined }) {
  if (typeof value !== "string" || !value.trim()) return null;
  return (
    <p className="type-body [overflow-wrap:anywhere] text-ink">
      <span className="text-ink-2">Назначение:</span> {value.trim()}
    </p>
  );
}
