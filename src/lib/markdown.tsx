import * as React from "react";

// Безопасный Markdown объявлений (SPEC §6.6 п.3, §9.4, AC-6.4). HTML не строится вообще:
// текст разбирается в узлы React, а React экранирует всё, что не стало элементом. Поэтому
// <script>, on*-атрибуты и сырой HTML остаются обычным текстом, а `dangerouslySetInnerHTML`
// нигде не используется. Поддержано: абзацы, заголовки (# → h3, чтобы не мешать h1/h2 страницы),
// списки (- и 1.), **жирный**, *курсив*, [ссылка](https://…). Ссылки только http(s), mailto и
// относительные пути внутри приложения; остальное (javascript:, data:, vbscript:) — просто текст.

const SAFE_URL = /^(https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+|\/(?![/\\])[^\s<>"']*)$/i;

/** Ссылка допустима, если после удаления управляющих символов и пробелов она проходит белый список. */
export function safeHref(raw: string): string | null {
  const url = raw.replace(/[\u0000-\u001f\u007f\s]+/g, "");
  return SAFE_URL.test(url) ? url : null;
}

const INLINE =
  /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|\[([^\]]+)\]\(([^)\s]+)\)|(?<![\p{L}\p{N}])_([^_\s][^_]*)_(?![\p{L}\p{N}])/gu;

function inline(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1] !== undefined) out.push(<strong key={k}>{inline(m[1], k)}</strong>);
    else if (m[2] !== undefined) out.push(<em key={k}>{inline(m[2], k)}</em>);
    else if (m[5] !== undefined) out.push(<em key={k}>{inline(m[5], k)}</em>);
    else {
      const href = safeHref(m[4] ?? "");
      if (href) {
        const external = /^https?:/i.test(href);
        out.push(
          <a
            key={k}
            href={href}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {m[3]}
            {external && <span className="sr-only"> (откроется в новой вкладке)</span>}
          </a>,
        );
      } else out.push(m[0]);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "ul" | "ol"; items: string[] };

function parse(md: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  for (const line of md.replace(/\r\n?/g, "\n").split("\n")) {
    const t = line.trim();
    const heading = /^#{1,6}\s+(.+)$/.exec(t);
    const bullet = /^[-*]\s+(.+)$/.exec(t);
    const numbered = /^\d+[.)]\s+(.+)$/.exec(t);
    if (!t) flush();
    else if (heading) {
      flush();
      blocks.push({ kind: "h", text: heading[1]! });
    } else if (bullet || numbered) {
      flush();
      const kind = bullet ? "ul" : "ol";
      const prev = blocks.at(-1);
      const text = (bullet ?? numbered)![1]!;
      if (prev && prev.kind === kind) prev.items.push(text);
      else blocks.push({ kind, items: [text] });
    } else para.push(t);
  }
  flush();
  return blocks;
}

export function SafeMarkdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={className}>
      {parse(source).map((b, i) => {
        const key = `b${i}`;
        if (b.kind === "h")
          return (
            <h3 key={key} className="type-h3">
              {inline(b.text, key)}
            </h3>
          );
        if (b.kind === "p") return <p key={key}>{inline(b.text, key)}</p>;
        const Tag = b.kind;
        return (
          <Tag key={key} className={b.kind === "ul" ? "list-disc pl-5" : "list-decimal pl-5"}>
            {b.items.map((it, j) => (
              <li key={j}>{inline(it, `${key}-${j}`)}</li>
            ))}
          </Tag>
        );
      })}
    </div>
  );
}
