"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

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

  // Warn before leaving with unsaved edits — but not on a real form submit.
  const submitting = useRef(false);
  useEffect(() => {
    const form = rootRef.current?.closest("form");
    const onSubmit = () => (submitting.current = true);
    form?.addEventListener("submit", onSubmit);
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!submitting.current && html !== defaultValue) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      form?.removeEventListener("submit", onSubmit);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [html, defaultValue]);

  // Borderless: the editor is the page's writing surface, not a form field.
  return (
    <div ref={rootRef}>
      <input type="hidden" name={name} value={html} />
      <Editor initialHTML={defaultValue} onChange={setHtml} />
    </div>
  );
}
