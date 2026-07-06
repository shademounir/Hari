"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useLocale, useTranslations } from "next-intl";
import { en, fr } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";

// The actual BlockNote (Notion-style) editor. Loaded client-only via next/dynamic
// from article-editor.tsx (BlockNote touches the DOM and can't SSR). It works in
// HTML: parses the document's stored HTML on mount and serializes back to clean
// semantic HTML on every change, so headings stay <h2>/<h3> — which the reader's
// anchor pass and the RAG chunker both rely on.
export function ArticleEditorImpl({
  initialHTML,
  onChange,
}: {
  initialHTML: string;
  onChange: (html: string) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("kb");
  // Localize the editor chrome (slash menu, placeholders, tooltips) to the app
  // locale; BlockNote ships the dictionaries. `domAttributes.editor` gives the
  // contenteditable an accessible name (it's a role=textbox with no <label> to
  // associate), so it passes axe's aria-input-field-name check.
  const editor = useCreateBlockNote({
    dictionary: locale === "fr" ? fr : en,
    domAttributes: { editor: { "aria-label": t("fieldContent") } },
  });
  const { resolvedTheme } = useTheme();

  // Load the stored HTML into the editor once, then emit the normalized HTML.
  useEffect(() => {
    let active = true;
    (async () => {
      if (initialHTML.trim()) {
        const blocks = await editor.tryParseHTMLToBlocks(initialHTML);
        if (!active) return;
        editor.replaceBlocks(editor.document, blocks);
      }
      const html = await editor.blocksToHTMLLossy(editor.document);
      if (active) onChange(html);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  return (
    <BlockNoteView
      editor={editor}
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      className="min-h-[26rem] py-2"
      onChange={async () => onChange(await editor.blocksToHTMLLossy(editor.document))}
    />
  );
}
