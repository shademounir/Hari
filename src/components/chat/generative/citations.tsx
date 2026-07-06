"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type CitationHit = {
  id: string;
  ref: number;
  section: string;
  anchor: string;
  content: string;
  similarity: number | null;
  articleTitle: string;
  articleSlug: string;
  collectionSlug: string;
  url: string;
};

// Collapsible like the reasoning panel: expanded while the answer streams (so you
// see what was retrieved), collapsed to a one-line header once the model is done.
// Each source is a deep link to the exact article section (`/kb/…#anchor`) so the
// reader can open and highlight it — the URLs come from the tool output, not the
// model.
export function Citations({
  query,
  results,
  streaming,
}: {
  query: string;
  results: CitationHit[];
  streaming: boolean;
}) {
  const t = useTranslations("citations");
  const [open, setOpen] = useState(false);
  const expanded = streaming || open;
  const panelId = useId();

  return (
    <div className="rounded-lg border bg-card text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-center gap-2 px-3 py-2 text-muted-foreground"
      >
        <BookOpen className="size-4 shrink-0" />
        <span className="truncate">
          {t("resultsFor", { query })}
          {results.length > 0 && ` (${results.length})`}
        </span>
        <ChevronDown
          className={cn("ml-auto size-3.5 shrink-0 transition-transform", expanded && "rotate-180")}
        />
      </button>

      {expanded && (
        <div id={panelId} className="space-y-2 px-3 pb-3">
          {results.length === 0 && (
            <p className="text-muted-foreground">{t("empty")}</p>
          )}
          <ul className="space-y-2">
            {results.map((r) => (
              <li key={r.id} className="rounded-md border bg-background">
                <Link
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("sourceLabel", {
                    ref: r.ref,
                    article: r.articleTitle,
                    section: r.section,
                  })}
                  className="block rounded-md p-2 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="font-mono text-xs text-muted-foreground">[{r.ref}]</span>
                      <span className="truncate font-medium">{r.section}</span>
                    </span>
                    {r.similarity != null && (
                      <Badge variant="secondary" className="text-[10px] tabular-nums">
                        {t("match", { pct: (r.similarity * 100).toFixed(0) })}
                      </Badge>
                    )}
                  </div>
                  <p className="mb-1 truncate text-xs font-medium text-muted-foreground">
                    {r.articleTitle}
                  </p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{r.content}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
