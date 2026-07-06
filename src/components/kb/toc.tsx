"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/kb/html";
import { cn } from "@/lib/utils";

// "On this page" table of contents with active-section highlight. The anchors come
// from extractToc (same slugger as the reader's heading ids), so links resolve and
// the IntersectionObserver can track which section is in view.
export function Toc({ items, label }: { items: TocItem[]; label: string }) {
  const [active, setActive] = useState("");

  useEffect(() => {
    const headings = items
      .map((i) => document.getElementById(i.anchor))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav aria-label={label} className="text-sm">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <ul className="space-y-0.5">
        {items.map((i) => (
          <li key={i.anchor}>
            <a
              href={`#${i.anchor}`}
              className={cn(
                "block border-l py-1 text-muted-foreground transition-colors hover:text-foreground",
                i.depth === 3 ? "pl-6" : "pl-3",
                active === i.anchor
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent",
              )}
            >
              {i.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
