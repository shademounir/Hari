"use client";

import { useEffect, useId, useState } from "react";
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
  // Auto-expands while streaming (to show live thinking) and collapses when done —
  // UNLESS the user has expressed a preference, which always wins (so the toggle
  // works mid-stream instead of looking broken). null = follow the auto behavior.
  const t = useTranslations("reasoning");
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const expanded = userOpen ?? streaming;
  const panelId = useId();

  // When streaming ends, drop any user override so the panel returns to its auto
  // state (collapsed to a one-line summary). Without this, a single mid-stream
  // click would pin the panel open/closed forever for this message.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync override to streaming lifecycle
    if (!streaming) setUserOpen(null);
  }, [streaming]);

  return (
    <div className="rounded-lg border bg-muted/40 text-sm">
      <button
        type="button"
        onClick={() => setUserOpen(!expanded)}
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
