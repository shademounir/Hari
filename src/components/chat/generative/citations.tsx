"use client";

import { useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Hit = { id: string; section: string; content: string; similarity: number };

// Collapsible like the reasoning panel: expanded while the answer streams (so you
// see what was retrieved), collapsed to a one-line header once the model is done.
export function Citations({
  query,
  results,
  streaming,
}: {
  query: string;
  results: Hit[];
  streaming: boolean;
}) {
  const t = useTranslations("citations");
  const [open, setOpen] = useState(false);
  const expanded = streaming || open;

  return (
    <div className="rounded-lg border bg-card text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={expanded}
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
        <div className="space-y-2 px-3 pb-3">
          {results.length === 0 && (
            <p className="text-muted-foreground">{t("empty")}</p>
          )}
          <ul className="space-y-2">
            {results.map((r) => (
              <li key={r.id} className="rounded-md border bg-background p-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium">{r.section}</span>
                  <Badge variant="secondary" className="text-[10px] tabular-nums">
                    {t("match", { pct: (r.similarity * 100).toFixed(0) })}
                  </Badge>
                </div>
                <p className="line-clamp-3 text-xs text-muted-foreground">{r.content}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
