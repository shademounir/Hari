"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// Two-pane split for the editor: a fluid left pane (canvas) and a fixed-width
// right pane (settings rail) the user can drag — or keyboard-resize — to taste,
// persisted to localStorage. Desktop only: below `lg` the panes stack (left then
// right) and the handle is hidden. The right width is exposed as a CSS var so it
// only applies at `lg` (mobile keeps the pane full-width).
export function ResizablePanels({
  left,
  right,
  storageKey,
  rightClassName,
  defaultWidth = 300,
  min = 260,
  max = 480,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  storageKey: string;
  rightClassName?: string;
  defaultWidth?: number;
  min?: number;
  max?: number;
}) {
  const t = useTranslations("kb");
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(defaultWidth);
  const widthRef = useRef(width);
  const clamp = (w: number) => Math.min(max, Math.max(min, w));
  const apply = (w: number) => {
    const c = clamp(w);
    widthRef.current = c;
    setWidth(c);
  };

  // Adopt the persisted width AFTER mount, on purpose: reading localStorage during
  // render (lazy init) would hydration-mismatch the SSR'd default, and the width is
  // also driven live by dragging — so useSyncExternalStore doesn't fit. One-time
  // post-mount sync is the right tool here.
  useEffect(() => {
    const saved = Number(localStorage.getItem(storageKey));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount adoption of persisted width (see above)
    if (saved) apply(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the storage key changes; `apply` is stable
  }, [storageKey]);

  const persist = () => localStorage.setItem(storageKey, String(widthRef.current));

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const onMove = (ev: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) apply(rect.right - ev.clientX); // rail hugs the right edge
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      persist();
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Rail hugs the right edge, so ArrowLeft widens it (+) and ArrowRight narrows it (−);
    // Home/End jump to the widest/narrowest.
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      apply(widthRef.current + 24);
      persist();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      apply(widthRef.current - 24);
      persist();
    } else if (e.key === "Home") {
      e.preventDefault();
      apply(max);
      persist();
    } else if (e.key === "End") {
      e.preventDefault();
      apply(min);
      persist();
    }
  };

  return (
    <div
      ref={containerRef}
      style={{ ["--rail-w" as string]: `${width}px` }}
      className="flex flex-col lg:min-h-0 lg:flex-1 lg:flex-row"
    >
      <div className="min-w-0 lg:flex-1 lg:overflow-y-auto">{left}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("resizePanels")}
        aria-valuenow={width}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={t("resizePanelsValue", { width })}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        className="hidden w-1.5 shrink-0 cursor-col-resize bg-border/60 transition-colors hover:bg-primary/40 focus-visible:bg-primary/40 focus-visible:outline-none lg:block"
      />
      <div
        className={cn(
          "shrink-0 lg:flex lg:w-[var(--rail-w)] lg:flex-col lg:overflow-hidden",
          rightClassName,
        )}
      >
        {right}
      </div>
    </div>
  );
}
