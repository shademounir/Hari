"use client";

import { useEffect } from "react";

// When the reader is opened at `…#section-anchor` (e.g. from a chat citation),
// scroll that heading into view and briefly flash it so the cited section is
// obvious. Respects prefers-reduced-motion: smooth scroll is skipped, and the
// flash transition is neutralized by the global reduce-motion rule.
export function HighlightOnHash() {
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const apply = () => {
      const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      el.classList.add("kb-highlight");
      timer = setTimeout(() => el.classList.remove("kb-highlight"), 1600);
    };

    // Defer so layout is ready, then react to in-page hash changes too.
    const raf = requestAnimationFrame(apply);
    window.addEventListener("hashchange", apply);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("hashchange", apply);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return null;
}
