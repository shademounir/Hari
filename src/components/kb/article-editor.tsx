"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

// Notion-style WYSIWYG editor for KB articles, replacing the old split-pane
// markdown editor. The BlockNote impl is loaded client-only (ssr:false) because
// it touches the DOM. Article content is stored as HTML, mirrored into a hidden
// <input name=…> so the existing server actions read it from formData unchanged.
const Editor = dynamic(() => import("./article-editor-impl").then((m) => m.ArticleEditorImpl), {
  ssr: false,
  loading: () => <div className="min-h-[26rem] animate-pulse rounded-md bg-muted/40" />,
});

export function ArticleEditor({
  name,
  defaultValue = "",
}: {
  name: string;
  defaultValue?: string;
}) {
  const [html, setHtml] = useState(defaultValue);
  const rootRef = useRef<HTMLDivElement>(null);

  // BlockNote re-serializes the content on mount (it normalizes HTML), so the first
  // emitted value differs from `defaultValue` for any non-BlockNote-authored
  // (seeded/legacy) article — comparing against `defaultValue` would flag an
  // untouched form as dirty and pop a false "unsaved changes" prompt. Instead take
  // the FIRST emitted HTML as the baseline and compare edits against it, so the
  // guard only fires on a genuine change.
  const baseline = useRef<string | null>(null);
  const handleChange = useCallback((next: string) => {
    if (baseline.current === null) baseline.current = next;
    setHtml(next);
  }, []);

  // Warn before leaving with unsaved edits — but not on a real form submit.
  const submitting = useRef(false);
  useEffect(() => {
    const form = rootRef.current?.closest("form");
    const onSubmit = () => (submitting.current = true);
    form?.addEventListener("submit", onSubmit);
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const dirty = baseline.current !== null && html !== baseline.current;
      if (!submitting.current && dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      form?.removeEventListener("submit", onSubmit);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [html]);

  // Borderless: the editor is the page's writing surface, not a form field.
  return (
    <div ref={rootRef}>
      <input type="hidden" name={name} value={html} />
      <Editor initialHTML={defaultValue} onChange={handleChange} />
    </div>
  );
}
