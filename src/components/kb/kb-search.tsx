"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { KbSearchResult } from "@/lib/kb";

// Button-triggered semantic search palette (⌘K is owned by the app-wide command
// palette, so this no longer binds it — one shortcut, no double-open). Debounced
// fetch to /api/kb/search (tier-scoped server-side); arrow keys + Enter to
// navigate; results deep-link to the exact section anchor.
export function KbSearch() {
  const t = useTranslations("kb");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<KbSearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset the palette on close in the open-change handler (not an effect) so we
  // don't setState while merely reacting to the `open` flag. Routed through here
  // by every close path: Escape/backdrop, selecting a result (go), and ⌘K toggle.
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQ("");
      setActive(0);
      setResults([]);
    }
  };

  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (query.length < 2) return; // too short to search; stale results are cleared in onQueryChange
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

  const hasResults = q.trim().length >= 2 && results.length > 0;

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
              onChange={(e) => {
                const next = e.target.value;
                setQ(next);
                // Dropping below 2 chars clears stale results immediately (in the
                // handler, not the effect), so the palette never shows results for
                // an effectively empty query.
                if (next.trim().length < 2) {
                  setResults([]);
                  setActive(0);
                }
              }}
              onKeyDown={onInputKey}
              placeholder={t("searchPlaceholder")}
              className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              aria-label={t("searchLabel")}
              role="combobox"
              aria-expanded={hasResults}
              aria-controls="kb-search-results"
              aria-autocomplete="list"
              aria-activedescendant={hasResults ? `kb-search-opt-${active}` : undefined}
            />
          </div>
          {/* Screen-reader status: searching / result count / no results (visual list below). */}
          <div role="status" aria-live="polite" className="sr-only">
            {loading
              ? t("searching")
              : q.trim().length >= 2
                ? results.length > 0
                  ? t("searchResults", { count: results.length })
                  : t("searchEmpty")
                : ""}
          </div>
          <ul id="kb-search-results" role="listbox" aria-label={t("searchLabel")} className="max-h-80 overflow-auto p-1">
            {q.trim().length >= 2 &&
              results.map((r, i) => (
              <li key={r.id} role="presentation">
                <button
                  type="button"
                  id={`kb-search-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
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
