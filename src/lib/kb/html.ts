// HTML chunker + TOC for the KB. Splits stored HTML at <h2>/<h3> into one chunk
// per section; heading slugs use the shared slugger (lib/kb/markdown) so a chunk's
// anchor matches the reader's heading id and citation deep-links resolve.
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import { toString as hastToString } from "hast-util-to-string";
import { createSlugger, type DocChunk } from "./markdown";

type HastNode = { type: string; tagName?: string; children?: HastNode[] };

const htmlParser = unified().use(rehypeParse, { fragment: true });

/**
 * Split stored HTML into chunks at `<h2>`/`<h3>`. Each chunk's `content` is the
 * section's plain text (for embedding + snippet); `anchor` is the heading slug.
 * Content before the first heading becomes an "Introduction" chunk (anchor "").
 */
export function chunkHtml(html: string): DocChunk[] {
  const tree = htmlParser.parse(html) as HastNode;
  const slugger = createSlugger();

  const chunks: DocChunk[] = [];
  let section = "Introduction";
  let anchor = "";
  let buf: string[] = [];

  const flush = () => {
    const text = buf.join(" ").replace(/\s+/g, " ").trim();
    if (text) chunks.push({ section, anchor, content: text, chunkIndex: chunks.length });
    buf = [];
  };

  // Recurse so a heading nested in a wrapper element still starts a section —
  // the reader's extractToc / rehypeKbAnchors recurse too, and the three walks
  // must agree (same slugger order) or citation anchors desync.
  const walk = (node: HastNode) => {
    if (node.type === "element" && (node.tagName === "h2" || node.tagName === "h3")) {
      flush();
      section = hastToString(node as never).trim() || "Section";
      anchor = slugger(section);
      return; // don't descend into the heading — its text is the title, not body
    }
    if (node.type === "text") {
      const value = (node as { value?: string }).value ?? "";
      if (value.trim()) buf.push(value);
      return;
    }
    (node.children ?? []).forEach(walk);
  };
  walk(tree);
  flush();

  return chunks;
}

/** Estimated reading time in minutes (≥1) from an article's HTML, at ~200 wpm. */
export function readingMinutes(html: string): number {
  const text = hastToString(htmlParser.parse(html) as never);
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export type TocItem = { depth: 2 | 3; text: string; anchor: string };

/**
 * Build an "On this page" table of contents from stored HTML — the h2/h3 headings
 * with anchors from the SAME shared slugger as the reader (so TOC links resolve to
 * real heading ids). Same walk order as chunkHtml → identical anchors.
 */
export function extractToc(html: string): TocItem[] {
  const tree = htmlParser.parse(html) as HastNode;
  const slugger = createSlugger();
  const items: TocItem[] = [];
  const walk = (node: HastNode) => {
    if (node.type === "element" && (node.tagName === "h2" || node.tagName === "h3")) {
      const text = hastToString(node as never).trim();
      if (text) items.push({ depth: node.tagName === "h2" ? 2 : 3, text, anchor: slugger(text) });
      return;
    }
    (node.children ?? []).forEach(walk);
  };
  walk(tree);
  return items;
}
