"use client";

import * as React from "react";
import { CloudCheck, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { DOCS_CACHE } from "@/lib/offline/policy";

// PDF справки с телефона (SPEC §6.5 п.7, §6.13 п.2, AC-13.1). Скачивание идёт через fetch: так файл
// берётся из Cache Storage, если сети нет, и туда же кладётся при первом открытии. Без JS работает
// обычная ссылка href.

async function cachedPdf(url: string): Promise<boolean> {
  try {
    return "caches" in window && (await (await caches.open(DOCS_CACHE)).match(url)) !== undefined;
  } catch {
    return false;
  }
}

export function useSavedOffline(url: string): boolean {
  const [saved, setSaved] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    const check = () => void cachedPdf(url).then((v) => alive && setSaved(v));
    check();
    // Офлайн-набор кладёт PDF в фоне — перепроверяем, когда вкладка снова на экране.
    const id = window.setInterval(check, 5000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [url]);
  return saved;
}

export function SavedOfflineBadge({ url }: { url: string }) {
  const saved = useSavedOffline(url);
  if (!saved) return null;
  return (
    <Badge tone="ok" icon={CloudCheck} data-testid="saved-offline">
      Есть на телефоне
    </Badge>
  );
}

export function DocumentDownload({
  url,
  fileName,
  size,
  className,
  testId,
}: {
  url: string;
  fileName: string;
  size?: "md" | "lg";
  className?: string;
  testId?: string;
}) {
  const toast = useToast();
  const [pending, setPending] = React.useState(false);

  async function download(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok || !res.headers.get("content-type")?.startsWith("application/pdf"))
        throw new Error(String(res.status));
      try {
        await (await caches.open(DOCS_CACHE)).put(url, res.clone());
      } catch {
        // Cache Storage закрыт: файл всё равно скачается.
      }
      const href = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = href;
      a.download = fileName;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
    } catch {
      toast({
        tone: "error",
        title: "Не получилось скачать",
        description: navigator.onLine
          ? "Попробуйте ещё раз через минуту."
          : "Эта справка ещё не сохранена на телефоне. Скачайте её, когда появится интернет.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Button asChild size={size} className={className}>
      <a
        href={url}
        download={fileName}
        onClick={download}
        aria-busy={pending || undefined}
        data-testid={testId}
      >
        <Download aria-hidden />
        Скачать PDF
      </a>
    </Button>
  );
}
