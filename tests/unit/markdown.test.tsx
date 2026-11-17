import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SafeMarkdown, safeHref } from "@/lib/markdown";
import { expandQuery } from "@/lib/search-synonyms";
import { linkHref } from "@/lib/notification-link";

// AC-6.4: санитайзер Markdown объявлений. HTML не строится, поэтому опасные куски остаются текстом.

const html = (md: string) => renderToStaticMarkup(<SafeMarkdown source={md} />);

const VECTORS = [
  "<script>alert(1)</script>",
  '<img src=x onerror="alert(1)">',
  "[клик](javascript:alert(1))",
  "[клик](  JaVaScRiPt:alert(1))",
  "[клик](java\tscript:alert(1))",
  "[клик](data:text/html;base64,PHNjcmlwdD4=)",
  "[клик](vbscript:msgbox(1))",
  "[клик](//evil.example/x)",
  '<a href="javascript:alert(1)" onclick="x()">a</a>',
  '<svg onload="alert(1)">',
  "<iframe src=//evil></iframe>",
];

describe("SafeMarkdown", () => {
  it.each(VECTORS)("вектор %s не даёт ни тегов, ни on*, ни javascript:", (v) => {
    const out = html(v);
    expect(out).not.toMatch(/<script|<img|<svg|<iframe/i);
    expect(out).not.toMatch(/<[^>]*\son\w+=/i);
    expect(out).not.toMatch(/href="\s*(javascript|data|vbscript):/i);
    expect(out).not.toMatch(/href="\/\//);
  });

  it("поддерживает абзацы, списки, жирный и безопасные ссылки", () => {
    const out = html(
      "## Заголовок\n\nТекст **важно** и [сайт](https://example.edu/a).\n\n- один\n- два",
    );
    expect(out).toContain("<h3");
    expect(out).toContain("<strong>важно</strong>");
    expect(out).toContain('href="https://example.edu/a"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain("<ul");
    expect(out.match(/<li>/g)).toHaveLength(2);
  });

  it("safeHref: белый список", () => {
    expect(safeHref("https://a.b/c")).toBe("https://a.b/c");
    expect(safeHref("/requests")).toBe("/requests");
    expect(safeHref("mailto:a@b.c")).toBe("mailto:a@b.c");
    expect(safeHref("javascript:1")).toBeNull();
    expect(safeHref("//x.y")).toBeNull();
  });
});

describe("синонимы и ссылки уведомлений", () => {
  it("«военкомат» расширяется, «ё» нормализуется", () => {
    expect(expandQuery("Военкомат")).toContain("форма 26");
    expect(expandQuery("ЁЖ")).toEqual(["еж"]);
  });
  it("каждый вид цели ведёт на существующий маршрут студента", () => {
    const id = "00000000-0000-4000-8000-000000000000";
    expect(linkHref("request", id)).toBe(`/requests/${id}`);
    expect(linkHref("ticket", id)).toBe(`/support/${id}`);
    expect(linkHref("deadline", id)).toMatch(/^\/study\/deadlines/);
    expect(linkHref("announcement", id)).toMatch(/^\/notifications/);
  });
});
