"use client";

import { useId, useState } from "react";
import { Brain, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// Collapsible "thinking" panel. Auto-expands while streaming, collapses when done.
export function Reasoning({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  // Default collapsed: auto-expands while streaming (to show live thinking), then
  // collapses to a one-line summary when done. Click to re-open.
  const t = useTranslations("reasoning");
  const [open, setOpen] = useState(false);
  const expanded = streaming || open;
  const panelId = useId();

  return (
    <div className="rounded-lg border bg-muted/40 text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground"
      >
        <Brain className={cn("size-3.5", streaming && "animate-pulse")} />
        {streaming ? t("thinking") : t("thoughtProcess")}
        <ChevronDown
          className={cn(
            "ml-auto size-3.5 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded && (
        <div
          id={panelId}
          className="whitespace-pre-wrap px-3 pb-3 text-xs leading-relaxed text-muted-foreground"
        >
          {text}
        </div>
      )}
    </div>
  );
}
