"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { KbSearchResult } from "@/lib/kb";

// ⌘K / button-triggered semantic search palette. Debounced fetch to
// /api/kb/search (tier-scoped server-side); arrow keys + Enter to navigate;
// results deep-link to the exact section anchor.
export function KbSearch() {
  const t = useTranslations("kb");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<KbSearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset the palette on close in the open-change handler (not an effect) so we
  // don't setState while merely reacting to the `open` flag. Routed through here
  // by every close path: Escape/backdrop, selecting a result (go), and ⌘K toggle.
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQ("");
      setActive(0);
    }
  };

  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (query.length < 2) return; // too short to search; the render shows the hint
    // Debounce the fetch; loading flips inside the callback so there's no
    // setState synchronously in the effect body.
    const id = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/kb/search?q=${encodeURIComponent(query)}`);
        const data = (await res.json()) as { results: KbSearchResult[] };
        setResults(data.results ?? []);
        setActive(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [q, open]);

  const go = (r: KbSearchResult) => {
    onOpenChange(false);
    router.push(r.url);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger render={<Button size="sm" variant="outline" />}>
        <Search className="size-4" /> {t("searchLabel")}
        <kbd className="ml-1 hidden rounded border bg-muted px-1 text-[10px] text-muted-foreground sm:inline">
          ⌘K
        </kbd>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/30 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          finalFocus={inputRef}
          className="fixed left-1/2 top-[12%] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border bg-card shadow-lg transition-all data-ending-style:opacity-0 data-starting-style:opacity-0"
        >
          <Dialog.Title className="sr-only">{t("searchLabel")}</Dialog.Title>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onInputKey}
              placeholder={t("searchPlaceholder")}
              className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              aria-label={t("searchLabel")}
            />
          </div>
          <ul className="max-h-80 overflow-auto p-1">
            {q.trim().length >= 2 &&
              results.map((r, i) => (
              <li key={r.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r)}
                  className={cn(
                    "flex w-full flex-col items-start rounded-md px-3 py-2 text-left text-sm",
                    i === active && "bg-muted",
                  )}
                >
                  <span className="font-medium">{r.section}</span>
                  <span className="text-xs text-muted-foreground">{r.articleTitle}</span>
                </button>
              </li>
            ))}
            {!loading && q.trim().length >= 2 && results.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">{t("searchEmpty")}</li>
            )}
            {q.trim().length < 2 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">{t("searchHint")}</li>
            )}
          </ul>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
