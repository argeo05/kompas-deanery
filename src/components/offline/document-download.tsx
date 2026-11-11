"use client";

import * as React from "react";
import { CloudCheck, Download, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { DOCS_CACHE } from "@/lib/offline/policy";

// PDF справки с телефона (SPEC §6.5 п.7, §6.13 п.2, AC-13.1). Скачивание идёт через fetch: так файл
// берётся из Cache Storage, если сети нет, и туда же кладётся при первом открытии. Без JS работает
// обычная ссылка href.

/** PDF только что сохранён на устройстве: метки «Есть на телефоне» перепроверяются сразу. */
const SAVED_EVENT = "kompas:doc-saved";

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
    // Офлайн-набор кладёт PDF в фоне — перепроверяем раз в 5 с и сразу после скачивания.
    const id = window.setInterval(check, 5000);
    window.addEventListener(SAVED_EVENT, check);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener(SAVED_EVENT, check);
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
      let saved = false;
      try {
        await (await caches.open(DOCS_CACHE)).put(url, res.clone());
        saved = true;
        window.dispatchEvent(new Event(SAVED_EVENT));
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
      toast({
        tone: "success",
        title: "Документ скачан",
        description: saved ? "Он сохранён и на телефоне: откроется и без интернета." : undefined,
      });
    } catch {
      toast({
        tone: "error",
        title: "Не получилось скачать",
        description: navigator.onLine
          ? "Попробуйте ещё раз через минуту."
          : "Этот документ ещё не сохранён на телефоне. Скачайте его, когда появится интернет.",
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
        aria-disabled={pending || undefined}
        data-testid={testId}
      >
        {pending ? (
          <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />
        ) : (
          <Download aria-hidden />
        )}
        Скачать PDF
      </a>
    </Button>
  );
}
